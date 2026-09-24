import { randomUUID } from "node:crypto";
import {
	closeSync,
	constants,
	fchmodSync,
	fsyncSync,
	linkSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	rmdirSync,
	rmSync,
	statSync,
	type Stats,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_STALE_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 25;
const OWNER_PREFIX = "owner-";
const OWNER_SUFFIX = ".json";
const STALE_BREAK_CLAIM = "stale-break.claim";
const asyncFunctionPrototype = Object.getPrototypeOf(async function (): Promise<void> {});
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

export type LedgerLockOptions = {
	timeoutMs?: number;
	staleMs?: number;
	retryDelayMs?: number;
};

export type AtomicWriteOptions = {
	mode?: number;
};

export type LedgerLockHandle = {
	readonly lockPath: string;
	readonly ownerToken: string;
	release(): void;
};

type ResolvedLockOptions = {
	timeoutMs: number;
	staleMs: number;
	retryDelayMs: number;
};

type OwnerRecord = {
	token: string;
	pid: number;
	acquiredAt: string;
};

type ClaimRecord = {
	token: string;
	pid: number;
	claimedAt: string;
};

type EntryObservation = {
	path: string;
	device: number;
	inode: number;
	modifiedMs: number;
};

type LockObservation = {
	owner: EntryObservation | null;
	claim: EntryObservation | null;
	modifiedMs: number;
	device: number;
	inode: number;
};

type ClaimHandle = {
	path: string;
	token: string;
};

class LockInitializationContendedError extends Error {}

export class LedgerLockTimeoutError extends Error {
	readonly targetPath: string;
	readonly lockPath: string;
	readonly timeoutMs: number;

	constructor(targetPath: string, lockPath: string, timeoutMs: number) {
		super(`timed out after ${timeoutMs}ms acquiring ledger lock ${lockPath} for ${targetPath}`);
		this.name = "LedgerLockTimeoutError";
		this.targetPath = targetPath;
		this.lockPath = lockPath;
		this.timeoutMs = timeoutMs;
	}
}

function requireFiniteNonNegativeInteger(name: string, value: number): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new TypeError(`${name} must be a non-negative safe integer`);
	}
	return value;
}

function resolveOptions(options: LedgerLockOptions): ResolvedLockOptions {
	if (typeof options !== "object" || options === null || Array.isArray(options)) {
		throw new TypeError("lock options must be an object");
	}
	const timeoutMs = requireFiniteNonNegativeInteger("timeoutMs", options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const staleMs = requireFiniteNonNegativeInteger("staleMs", options.staleMs ?? DEFAULT_STALE_MS);
	const retryDelayMs = requireFiniteNonNegativeInteger(
		"retryDelayMs",
		options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
	);
	if (staleMs === 0) throw new TypeError("staleMs must be greater than zero");
	if (retryDelayMs === 0) throw new TypeError("retryDelayMs must be greater than zero");
	return { timeoutMs, staleMs, retryDelayMs };
}

function resolveAdjacentPath(targetPath: string): { targetPath: string; directoryPath: string; baseName: string } {
	if (typeof targetPath !== "string" || targetPath.trim() === "") {
		throw new TypeError("targetPath must be a non-empty string");
	}
	const baseName = basename(targetPath);
	if (baseName === "." || baseName === "..") {
		throw new TypeError(`targetPath must name a file: ${targetPath}`);
	}
	const requestedDirectory = dirname(targetPath);
	let directoryPath: string;
	try {
		directoryPath = realpathSync(requestedDirectory);
	} catch (error: unknown) {
		throw new Error(`cannot resolve parent directory for ${targetPath}`, { cause: error });
	}
	let directoryStat: Stats;
	try {
		directoryStat = statSync(directoryPath);
	} catch (error: unknown) {
		throw new Error(`cannot inspect parent directory for ${targetPath}`, { cause: error });
	}
	if (!directoryStat.isDirectory()) throw new TypeError(`parent path is not a directory: ${requestedDirectory}`);
	return { targetPath: join(directoryPath, baseName), directoryPath, baseName };
}

export function ledgerLockPath(targetPath: string): string {
	const resolved = resolveAdjacentPath(targetPath);
	return join(resolved.directoryPath, `.${resolved.baseName}.lock`);
}

function isMissing(error: unknown): boolean {
	return error instanceof Error && (
		("code" in error && error.code === "ENOENT") ||
		(error.cause !== undefined && isMissing(error.cause))
	);
}

function isAlreadyPresent(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isInvalidArgument(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "EINVAL";
}

function isNotEmpty(error: unknown): boolean {
	return error instanceof Error && "code" in error && (error.code === "ENOTEMPTY" || error.code === "EEXIST");
}

function isMissingWithCause(error: unknown): boolean {
	return isMissing(error) || (error instanceof Error && error.cause !== undefined && isMissing(error.cause));
}

function sleepSync(milliseconds: number): void {
	Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}

function ownerFileName(token: string): string {
	return `${OWNER_PREFIX}${token}${OWNER_SUFFIX}`;
}

function hasExactKeys(record: Record<string, unknown>, expected: string[]): boolean {
	const actual = Object.keys(record).sort();
	const sortedExpected = [...expected].sort();
	return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function parseMetadata(path: string, kind: "owner" | "claim"): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error: unknown) {
		throw new Error(`ledger lock ${kind} metadata is invalid JSON: ${path}`, { cause: error });
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error(`ledger lock ${kind} metadata has an invalid shape: ${path}`);
	}
	return parsed as Record<string, unknown>;
}

function parseOwner(path: string): OwnerRecord {
	const record = parseMetadata(path, "owner");
	if (
		!hasExactKeys(record, ["token", "pid", "acquiredAt"]) ||
		typeof record.token !== "string" ||
		record.token === "" ||
		ownerFileName(record.token) !== basename(path) ||
		!Number.isSafeInteger(record.pid) ||
		(record.pid as number) <= 0 ||
		typeof record.acquiredAt !== "string" ||
		!Number.isFinite(Date.parse(record.acquiredAt))
	) {
		throw new Error(`ledger lock owner metadata has an invalid shape: ${path}`);
	}
	return { token: record.token, pid: record.pid as number, acquiredAt: record.acquiredAt };
}

function parseClaim(path: string): ClaimRecord {
	const record = parseMetadata(path, "claim");
	if (
		!hasExactKeys(record, ["token", "pid", "claimedAt"]) ||
		typeof record.token !== "string" ||
		record.token === "" ||
		!Number.isSafeInteger(record.pid) ||
		(record.pid as number) <= 0 ||
		typeof record.claimedAt !== "string" ||
		!Number.isFinite(Date.parse(record.claimedAt))
	) {
		throw new Error(`ledger lock claim metadata has an invalid shape: ${path}`);
	}
	return { token: record.token, pid: record.pid as number, claimedAt: record.claimedAt };
}

function inspectRegularEntry(path: string, kind: "owner" | "claim"): EntryObservation {
	let entryStat: Stats;
	try {
		entryStat = lstatSync(path);
	} catch (error: unknown) {
		if (isMissing(error)) throw error;
		throw new Error(`cannot inspect ledger lock ${kind} ${path}`, { cause: error });
	}
	if (!entryStat.isFile() || entryStat.isSymbolicLink()) {
		throw new Error(`ledger lock ${kind} is not a regular file: ${path}`);
	}
	return {
		path,
		device: entryStat.dev,
		inode: entryStat.ino,
		modifiedMs: entryStat.mtimeMs,
	};
}

function sameEntry(left: EntryObservation, right: EntryObservation): boolean {
	return left.device === right.device && left.inode === right.inode;
}

function sameDirectory(observation: LockObservation, current: LockObservation): boolean {
	return observation.device === current.device && observation.inode === current.inode;
}

function observeLock(lockPath: string): LockObservation {
	let lockStat: Stats;
	try {
		lockStat = lstatSync(lockPath);
	} catch (error: unknown) {
		if (isMissing(error)) throw error;
		throw new Error(`cannot inspect ledger lock ${lockPath}`, { cause: error });
	}
	if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) {
		throw new Error(`ledger lock path is not a regular directory: ${lockPath}`);
	}

	let entries: string[];
	try {
		entries = readdirSync(lockPath);
	} catch (error: unknown) {
		throw new Error(`cannot read ledger lock directory ${lockPath}`, { cause: error });
	}
	const ownerEntries = entries.filter(
		(entry) => entry.startsWith(OWNER_PREFIX) && entry.endsWith(OWNER_SUFFIX),
	);
	const hasClaim = entries.includes(STALE_BREAK_CLAIM);
	if (ownerEntries.length > 1 || entries.length !== ownerEntries.length + (hasClaim ? 1 : 0)) {
		throw new Error(`ledger lock directory has unexpected contents: ${lockPath}`);
	}

	return {
		owner: ownerEntries.length === 1
			? inspectRegularEntry(join(lockPath, ownerEntries[0]), "owner")
			: null,
		claim: hasClaim ? inspectRegularEntry(join(lockPath, STALE_BREAK_CLAIM), "claim") : null,
		modifiedMs: lockStat.mtimeMs,
		device: lockStat.dev,
		inode: lockStat.ino,
	};
}

function fsyncDirectory(directoryPath: string): void {
	let descriptor: number | undefined;
	try {
		descriptor = openSync(directoryPath, constants.O_RDONLY);
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
	} catch (error: unknown) {
		if (descriptor !== undefined) {
			try {
				closeSync(descriptor);
			} catch (closeError: unknown) {
				throw new AggregateError([error, closeError], `cannot fsync directory ${directoryPath}`);
			}
		}
		throw new Error(`cannot fsync directory ${directoryPath}`, { cause: error });
	}
}

function writeCompleteTemp(path: string, contents: string): void {
	let descriptor: number | undefined;
	try {
		descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
		writeFileSync(descriptor, contents, "utf8");
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
	} catch (error: unknown) {
		const errors: unknown[] = [error];
		if (descriptor !== undefined) {
			try {
				closeSync(descriptor);
			} catch (closeError: unknown) {
				errors.push(closeError);
			}
		}
		try {
			rmSync(path, { force: true });
		} catch (cleanupError: unknown) {
			errors.push(cleanupError);
		}
		if (errors.length > 1) throw new AggregateError(errors, `cannot publish complete metadata temp ${path}`);
		throw new Error(`cannot publish complete metadata temp ${path}`, { cause: error });
	}
}

function removeOwnedClaim(claimPath: string, claimToken: string): void {
	let claim: ClaimRecord;
	try {
		inspectRegularEntry(claimPath, "claim");
		claim = parseClaim(claimPath);
	} catch (error: unknown) {
		if (isMissingWithCause(error)) return;
		throw new Error(`cannot verify stale-break claim ${claimPath}`, { cause: error });
	}
	if (claim.token !== claimToken || claim.pid !== process.pid) {
		throw new Error(`refusing to remove stale-break claim not owned by this process: ${claimPath}`);
	}
	try {
		unlinkSync(claimPath);
	} catch (error: unknown) {
		if (!isMissing(error)) throw new Error(`cannot remove stale-break claim ${claimPath}`, { cause: error });
	}
}

function publishClaim(lockPath: string, observation: LockObservation): ClaimHandle | null {
	const token = randomUUID();
	const claimPath = join(lockPath, STALE_BREAK_CLAIM);
	const tempPath = `${lockPath}.claim-${process.pid}-${token}.tmp`;
	writeCompleteTemp(tempPath, `${JSON.stringify({ token, pid: process.pid, claimedAt: new Date().toISOString() })}\n`);

	let linked = false;
	try {
		const current = observeLock(lockPath);
		if (!sameDirectory(observation, current)) return null;
		linkSync(tempPath, claimPath);
		linked = true;
		unlinkSync(tempPath);
		fsyncDirectory(lockPath);
		inspectRegularEntry(claimPath, "claim");
		const record = parseClaim(claimPath);
		if (record.token !== token || record.pid !== process.pid) {
			throw new LockInitializationContendedError(`stale-break claim publication was replaced: ${claimPath}`);
		}
		return { path: claimPath, token };
	} catch (error: unknown) {
		const errors: unknown[] = [error];
		if (linked) {
			try {
				removeOwnedClaim(claimPath, token);
			} catch (cleanupError: unknown) {
				errors.push(cleanupError);
			}
		}
		try {
			rmSync(tempPath, { force: true });
		} catch (cleanupError: unknown) {
			errors.push(cleanupError);
		}
		if (errors.length > 1) throw new AggregateError(errors, `cannot publish stale-break claim ${claimPath}`);
		// macOS reports EINVAL, rather than ENOENT, when the validated claim
		// parent is concurrently quarantined between observeLock and link.
		if (isAlreadyPresent(error) || isMissing(error) || (!linked && isInvalidArgument(error))) return null;
		throw new Error(`cannot publish stale-break claim ${claimPath}`, { cause: error });
	} finally {
		if (!linked) rmSync(tempPath, { force: true });
	}
}

function restoreDisplacedClaim(lockPath: string, displacedPath: string, observation: LockObservation): void {
	try {
		const current = observeLock(lockPath);
		if (!sameDirectory(observation, current) || current.claim !== null) {
			unlinkSync(displacedPath);
			return;
		}
		linkSync(displacedPath, join(lockPath, STALE_BREAK_CLAIM));
		unlinkSync(displacedPath);
	} catch (error: unknown) {
		if (isAlreadyPresent(error) || isMissing(error)) {
			rmSync(displacedPath, { force: true });
			return;
		}
		throw new Error(`cannot restore displaced stale-break claim ${displacedPath}`, { cause: error });
	}
}

function isProcessDemonstrablyDead(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return false;
	} catch (error: unknown) {
		// ESRCH is the only proof that a process is gone. Alive, EPERM, and
		// unknown probe outcomes remain non-breakable until the bounded timeout.
		return error instanceof Error && "code" in error && error.code === "ESRCH";
	}
}

function isRecordAged(modifiedMs: number, timestamp: string, staleMs: number, now: number): boolean {
	return now - Math.max(modifiedMs, Date.parse(timestamp)) >= staleMs;
}

function replaceAbandonedClaim(
	lockPath: string,
	observation: LockObservation,
	staleMs: number,
	now: number,
): ClaimHandle | null {
	const observedClaim = observation.claim;
	if (observedClaim === null) return publishClaim(lockPath, observation);
	if (now - observedClaim.modifiedMs < staleMs) return null;

	const claim = parseClaim(observedClaim.path);
	if (!isRecordAged(observedClaim.modifiedMs, claim.claimedAt, staleMs, now)) return null;
	if (!isProcessDemonstrablyDead(claim.pid)) return null;

	const displacedPath = `${lockPath}.abandoned-claim-${process.pid}-${randomUUID()}`;
	try {
		const current = observeLock(lockPath);
		if (!sameDirectory(observation, current) || current.claim === null || !sameEntry(observedClaim, current.claim)) {
			return null;
		}
		const currentClaim = parseClaim(current.claim.path);
		if (currentClaim.token !== claim.token || currentClaim.pid !== claim.pid) return null;
		renameSync(current.claim.path, displacedPath);
	} catch (error: unknown) {
		if (isMissing(error)) return null;
		throw new Error(`cannot isolate abandoned stale-break claim ${observedClaim.path}`, { cause: error });
	}

	let displaced: EntryObservation;
	try {
		displaced = inspectRegularEntry(displacedPath, "claim");
		const displacedClaim = parseClaim(displacedPath);
		if (
			!sameEntry(displaced, observedClaim) ||
			displacedClaim.token !== claim.token ||
			displacedClaim.pid !== claim.pid
		) {
			restoreDisplacedClaim(lockPath, displacedPath, observation);
			return null;
		}
	} catch (error: unknown) {
		if (isMissingWithCause(error)) return null;
		throw error;
	}

	let ownClaim: ClaimHandle | null = null;
	try {
		const current = observeLock(lockPath);
		if (!sameDirectory(observation, current) || current.claim !== null) return null;
		ownClaim = publishClaim(lockPath, current);
		return ownClaim;
	} finally {
		try {
			rmSync(displacedPath, { force: true });
		} catch (cleanupError: unknown) {
			if (ownClaim !== null) {
				try {
					removeOwnedClaim(ownClaim.path, ownClaim.token);
				} catch (claimCleanupError: unknown) {
					throw new AggregateError(
						[cleanupError, claimCleanupError],
						`cannot clean abandoned or replacement claim for ${lockPath}`,
					);
				}
			}
			throw new Error(`cannot remove abandoned stale-break claim ${displacedPath}`, { cause: cleanupError });
		}
	}
}

function observationCanBeClaimed(observation: LockObservation, staleMs: number, now: number): boolean {
	if (observation.claim !== null && now - observation.claim.modifiedMs >= staleMs) return true;
	if (observation.owner !== null) return now - observation.owner.modifiedMs >= staleMs;
	return now - observation.modifiedMs >= staleMs;
}

function releaseClaimAfterError(claim: ClaimHandle, error: unknown): never {
	try {
		removeOwnedClaim(claim.path, claim.token);
	} catch (cleanupError: unknown) {
		throw new AggregateError([error, cleanupError], `cannot revalidate or release stale-break claim ${claim.path}`);
	}
	throw error;
}

function breakStaleLock(lockPath: string, observation: LockObservation, staleMs: number): boolean {
	const now = Date.now();
	if (!observationCanBeClaimed(observation, staleMs, now)) return false;
	const claim = replaceAbandonedClaim(lockPath, observation, staleMs, now);
	if (claim === null) return false;

	let claimedObservation: LockObservation;
	try {
		claimedObservation = observeLock(lockPath);
		if (!sameDirectory(observation, claimedObservation) || claimedObservation.claim === null) {
			removeOwnedClaim(claim.path, claim.token);
			return false;
		}
		const currentClaim = parseClaim(claimedObservation.claim.path);
		if (
			currentClaim.token !== claim.token ||
			currentClaim.pid !== process.pid ||
			claimedObservation.claim.path !== claim.path
		) {
			throw new Error(`stale-break claim identity changed before lock revalidation: ${claim.path}`);
		}
	} catch (error: unknown) {
		if (isMissingWithCause(error)) return false;
		return releaseClaimAfterError(claim, error);
	}

	let owner: OwnerRecord | null = null;
	if (claimedObservation.owner !== null) {
		try {
			owner = parseOwner(claimedObservation.owner.path);
		} catch (error: unknown) {
			if (!isMissingWithCause(error)) return releaseClaimAfterError(claim, error);
			// A live owner may release after the breaker publishes its claim: it
			// unlinks its owner, sees the claim at rmdir, and stops. Re-observe
			// that legitimate owner-to-ownerless transition under the same claim.
			try {
				const ownerless = observeLock(lockPath);
				const ownerlessClaim = ownerless.claim === null ? null : parseClaim(ownerless.claim.path);
				if (
					!sameDirectory(observation, ownerless) ||
					ownerless.owner !== null ||
					ownerlessClaim === null ||
					ownerlessClaim.token !== claim.token ||
					ownerlessClaim.pid !== process.pid
				) {
					removeOwnedClaim(claim.path, claim.token);
					return false;
				}
				claimedObservation = ownerless;
			} catch (reobserveError: unknown) {
				if (isMissingWithCause(reobserveError)) return false;
				return releaseClaimAfterError(claim, reobserveError);
			}
		}
	}
	if (owner !== null && claimedObservation.owner !== null) {
		const ownerIsSame = observation.owner !== null && sameEntry(observation.owner, claimedObservation.owner);
		const ownerIsAged = isRecordAged(
			claimedObservation.owner.modifiedMs,
			owner.acquiredAt,
			staleMs,
			Date.now(),
		);
		if (!ownerIsSame || !ownerIsAged || !isProcessDemonstrablyDead(owner.pid)) {
			removeOwnedClaim(claim.path, claim.token);
			return false;
		}
	} else {
		const ownerlessWasStale =
			observation.owner !== null ||
			Date.now() - observation.modifiedMs >= staleMs ||
			(observation.claim !== null && Date.now() - observation.claim.modifiedMs >= staleMs);
		if (!ownerlessWasStale) {
			removeOwnedClaim(claim.path, claim.token);
			return false;
		}
	}

	const quarantinePath = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
	try {
		renameSync(lockPath, quarantinePath);
	} catch (error: unknown) {
		try {
			removeOwnedClaim(claim.path, claim.token);
		} catch (cleanupError: unknown) {
			throw new AggregateError([error, cleanupError], `cannot quarantine or release stale ledger lock ${lockPath}`);
		}
		if (isMissing(error)) return false;
		throw new Error(`cannot quarantine stale ledger lock ${lockPath}`, { cause: error });
	}

	const quarantinedClaimPath = join(quarantinePath, STALE_BREAK_CLAIM);
	const quarantinedOwnerPath = owner === null ? null : join(quarantinePath, ownerFileName(owner.token));
	try {
		const quarantined = observeLock(quarantinePath);
		if (!sameDirectory(claimedObservation, quarantined) || quarantined.claim === null) {
			throw new Error(`quarantined ledger lock identity changed: ${quarantinePath}`);
		}
		const quarantinedClaim = parseClaim(quarantinedClaimPath);
		if (quarantinedClaim.token !== claim.token || quarantinedClaim.pid !== process.pid) {
			throw new Error(`quarantined stale-break claim identity changed: ${quarantinedClaimPath}`);
		}
		if (owner === null) {
			if (quarantined.owner !== null) {
				throw new Error(`owner appeared during stale lock quarantine: ${quarantinePath}`);
			}
		} else {
			if (quarantined.owner === null || quarantinedOwnerPath === null || !sameEntry(claimedObservation.owner!, quarantined.owner)) {
				throw new Error(`quarantined ledger owner identity changed: ${quarantinePath}`);
			}
			const quarantinedOwner = parseOwner(quarantinedOwnerPath);
			if (quarantinedOwner.token !== owner.token || quarantinedOwner.pid !== owner.pid) {
				throw new Error(`quarantined ledger owner metadata changed: ${quarantinedOwnerPath}`);
			}
			unlinkSync(quarantinedOwnerPath);
		}
		removeOwnedClaim(quarantinedClaimPath, claim.token);
		rmdirSync(quarantinePath);
	} catch (error: unknown) {
		throw new Error(`cannot remove quarantined stale ledger lock ${quarantinePath}`, { cause: error });
	}
	return true;
}

function releaseOwnedLock(lockPath: string, ownerPath: string, ownerToken: string): void {
	let owner: OwnerRecord;
	try {
		inspectRegularEntry(ownerPath, "owner");
		owner = parseOwner(ownerPath);
	} catch (error: unknown) {
		if (isMissingWithCause(error)) return;
		throw error;
	}
	if (owner.token !== ownerToken || owner.pid !== process.pid) return;
	try {
		unlinkSync(ownerPath);
	} catch (error: unknown) {
		if (isMissing(error)) return;
		throw new Error(`cannot remove ledger lock owner ${ownerPath}`, { cause: error });
	}
	try {
		rmdirSync(lockPath);
	} catch (error: unknown) {
		// A breaker claim deliberately keeps the directory present. ENOENT and
		// ENOTEMPTY both mean this old handle must not touch a replacement.
		if (isMissing(error) || isNotEmpty(error)) return;
		throw new Error(`cannot remove ledger lock directory ${lockPath}`, { cause: error });
	}
}

function cleanupInitialization(
	lockPath: string,
	ownerPath: string,
	ownerToken: string,
	claim: ClaimHandle | null,
	tempPath: string,
	error: unknown,
): never {
	const errors: unknown[] = [error];
	try {
		rmSync(tempPath, { force: true });
	} catch (cleanupError: unknown) {
		errors.push(cleanupError);
	}
	try {
		const owner = parseOwner(ownerPath);
		if (owner.token === ownerToken && owner.pid === process.pid) unlinkSync(ownerPath);
	} catch (cleanupError: unknown) {
		if (!isMissingWithCause(cleanupError)) errors.push(cleanupError);
	}
	if (claim !== null) {
		try {
			removeOwnedClaim(claim.path, claim.token);
		} catch (cleanupError: unknown) {
			errors.push(cleanupError);
		}
	}
	try {
		rmdirSync(lockPath);
	} catch (cleanupError: unknown) {
		if (!isMissing(cleanupError) && !isNotEmpty(cleanupError)) errors.push(cleanupError);
	}
	if (errors.length === 1) throw error;
	throw new AggregateError(errors, `cannot clean failed ledger lock initialization ${lockPath}`);
}

function initializeLock(lockPath: string): { ownerPath: string; ownerToken: string } {
	const ownerToken = randomUUID();
	const ownerPath = join(lockPath, ownerFileName(ownerToken));
	const tempPath = `${lockPath}.owner-${process.pid}-${ownerToken}.tmp`;
	const owner: OwnerRecord = {
		token: ownerToken,
		pid: process.pid,
		acquiredAt: new Date().toISOString(),
	};
	writeCompleteTemp(tempPath, `${JSON.stringify(owner)}\n`);

	try {
		mkdirSync(lockPath, { mode: 0o700 });
	} catch (error: unknown) {
		try {
			rmSync(tempPath, { force: true });
		} catch (cleanupError: unknown) {
			throw new AggregateError([error, cleanupError], `cannot clean owner temp after mkdir failure ${tempPath}`);
		}
		throw error;
	}

	let claim: ClaimHandle | null = null;
	try {
		const empty = observeLock(lockPath);
		if (empty.owner !== null || empty.claim !== null) {
			throw new LockInitializationContendedError(`new ledger lock directory was not empty: ${lockPath}`);
		}
		claim = publishClaim(lockPath, empty);
		if (claim === null) {
			throw new LockInitializationContendedError(`ledger lock initialization claim was contended: ${lockPath}`);
		}
		renameSync(tempPath, ownerPath);
		fsyncDirectory(lockPath);
		const installed = observeLock(lockPath);
		if (installed.owner === null || installed.claim === null || installed.owner.path !== ownerPath) {
			throw new LockInitializationContendedError(`ledger lock owner installation was replaced: ${ownerPath}`);
		}
		const installedOwner = parseOwner(ownerPath);
		const installedClaim = parseClaim(claim.path);
		if (
			installedOwner.token !== ownerToken ||
			installedOwner.pid !== process.pid ||
			installedClaim.token !== claim.token ||
			installedClaim.pid !== process.pid
		) {
			throw new LockInitializationContendedError(`ledger lock initialization identity changed: ${lockPath}`);
		}
		removeOwnedClaim(claim.path, claim.token);
		claim = null;
		fsyncDirectory(lockPath);
		const ready = observeLock(lockPath);
		if (ready.owner === null || ready.owner.path !== ownerPath || ready.claim !== null) {
			throw new LockInitializationContendedError(`ledger lock owner was not exclusively published: ${ownerPath}`);
		}
		return { ownerPath, ownerToken };
	} catch (error: unknown) {
		return cleanupInitialization(lockPath, ownerPath, ownerToken, claim, tempPath, error);
	}
}

export function acquireLedgerLock(
	targetPath: string,
	options: LedgerLockOptions = {},
): LedgerLockHandle {
	const resolvedTarget = resolveAdjacentPath(targetPath);
	const resolvedOptions = resolveOptions(options);
	const lockPath = join(resolvedTarget.directoryPath, `.${resolvedTarget.baseName}.lock`);
	const deadline = Date.now() + resolvedOptions.timeoutMs;

	while (true) {
		try {
			const installed = initializeLock(lockPath);
			let released = false;
			return {
				lockPath,
				ownerToken: installed.ownerToken,
				release(): void {
					if (released) return;
					releaseOwnedLock(lockPath, installed.ownerPath, installed.ownerToken);
					released = true;
				},
			};
		} catch (error: unknown) {
			if (!(error instanceof LockInitializationContendedError) && !isAlreadyPresent(error)) {
				if (isMissing(error) && Date.now() <= deadline) continue;
				throw new Error(`cannot acquire ledger lock ${lockPath}`, { cause: error });
			}
		}

		let observation: LockObservation;
		try {
			observation = observeLock(lockPath);
		} catch (error: unknown) {
			if (isMissing(error) && Date.now() <= deadline) continue;
			throw error;
		}
		if (breakStaleLock(lockPath, observation, resolvedOptions.staleMs)) continue;

		const now = Date.now();
		if (now >= deadline) {
			throw new LedgerLockTimeoutError(resolvedTarget.targetPath, lockPath, resolvedOptions.timeoutMs);
		}
		sleepSync(Math.min(resolvedOptions.retryDelayMs, deadline - now));
	}
}

function isThenable(value: unknown): boolean {
	if ((typeof value !== "object" || value === null) && typeof value !== "function") return false;
	let then: unknown;
	try {
		then = Reflect.get(value, "then");
	} catch (error: unknown) {
		throw new TypeError("withLedgerLock callback result cannot be inspected for thenable behavior", {
			cause: error,
		});
	}
	return typeof then === "function";
}

export function withLedgerLock<T>(
	targetPath: string,
	run: () => T,
	options: LedgerLockOptions = {},
): T {
	if (typeof run !== "function") throw new TypeError("run must be a function");
	if (Object.getPrototypeOf(run) === asyncFunctionPrototype) {
		throw new TypeError("withLedgerLock requires a synchronous callback; async functions are not supported");
	}
	const lock = acquireLedgerLock(targetPath, options);
	let result!: T;
	let callbackError: unknown;
	let callbackFailed = false;
	try {
		result = run();
	} catch (error: unknown) {
		callbackFailed = true;
		callbackError = error;
	}
	try {
		lock.release();
	} catch (releaseError: unknown) {
		if (callbackFailed) {
			throw new AggregateError([callbackError, releaseError], `ledger callback and lock release both failed for ${targetPath}`);
		}
		throw releaseError;
	}
	if (callbackFailed) throw callbackError;
	if (isThenable(result)) {
		throw new TypeError("withLedgerLock requires a synchronous callback; Promise and thenable results are not supported");
	}
	return result;
}

function validateReplaceableTarget(targetPath: string): number | undefined {
	let targetStat: Stats;
	try {
		targetStat = lstatSync(targetPath);
	} catch (error: unknown) {
		if (isMissing(error)) return undefined;
		throw new Error(`cannot inspect atomic-write target ${targetPath}`, { cause: error });
	}
	if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
		throw new Error(`atomic-write target is not a regular file: ${targetPath}`);
	}
	return targetStat.mode & 0o7777;
}

export function atomicWriteFileSync(
	targetPath: string,
	data: string | Uint8Array,
	options: AtomicWriteOptions = {},
): void {
	if (typeof options !== "object" || options === null || Array.isArray(options)) {
		throw new TypeError("atomic-write options must be an object");
	}
	if (typeof data !== "string" && !(data instanceof Uint8Array)) {
		throw new TypeError("atomic-write data must be a string or Uint8Array");
	}
	if (
		options.mode !== undefined &&
		(!Number.isSafeInteger(options.mode) || options.mode < 0 || options.mode > 0o7777)
	) {
		throw new TypeError("atomic-write mode must be an integer between 0 and 0o7777");
	}
	const resolved = resolveAdjacentPath(targetPath);
	const mode = options.mode ?? 0o666;
	const tempPath = join(
		resolved.directoryPath,
		`.${resolved.baseName}.${process.pid}-${randomUUID()}.tmp`,
	);
	let descriptor: number | undefined;
	let renamed = false;
	try {
		descriptor = openSync(tempPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
		writeFileSync(descriptor, data);
		const existingMode = validateReplaceableTarget(resolved.targetPath);
		if (options.mode === undefined && existingMode !== undefined) fchmodSync(descriptor, existingMode);
		fsyncSync(descriptor);
		closeSync(descriptor);
		descriptor = undefined;
		validateReplaceableTarget(resolved.targetPath);
		renameSync(tempPath, resolved.targetPath);
		renamed = true;
		fsyncDirectory(resolved.directoryPath);
	} catch (error: unknown) {
		const errors: unknown[] = [error];
		if (descriptor !== undefined) {
			try {
				closeSync(descriptor);
			} catch (closeError: unknown) {
				errors.push(closeError);
			}
		}
		if (!renamed) {
			try {
				rmSync(tempPath, { force: true });
			} catch (cleanupError: unknown) {
				errors.push(cleanupError);
			}
		}
		if (errors.length === 1) throw error;
		throw new AggregateError(errors, `atomic write failed and cleanup was incomplete for ${resolved.targetPath}`);
	}
}
