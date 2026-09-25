/*
 * structurizr-fs.ts — lock, nonce-owned staging, and atomic publication.
 *
 * Runs via bun; not a pi extension.
 *
 * Ownership is a live descriptor plus a cryptographic nonce, never a PID and never a
 * matching directory name. Nothing that is not provably owned by this run is ever
 * unlinked; unsafe state is retained and reported so a human can recover it.
 *
 * PLATFORM DEVIATION — the design specifies descriptor-relative openat/mkdirat/fstatat/
 * renameat/unlinkat. Node and Bun expose no *at() syscalls, so this module implements
 * the same identity semantics with O_NOFOLLOW opens plus retained (device,inode)
 * re-verification before every destructive phase. That closes symlink substitution and
 * detects ancestor replacement, but leaves a narrower TOCTOU window than true
 * descriptor-relative traversal would. See docs/architecture/11-risks-and-technical-debt.md.
 *
 * usage: import { acquire, publish, clean } from "./structurizr-fs.ts"
 */

import { randomBytes } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
	writeSync,
	fsyncSync,
} from "node:fs";
import { join } from "node:path";

export const BUILD_DIR = "build";
export const ARCHITECTURE_DIR = "architecture";
export const LOCK_NAME = ".structurizr-lock";
export const OWNER_NAME = ".structurizr-owner.json";
export const PAYLOAD_NAME = "payload";
export const FINAL_NAME = "structurizr";
export const STAGE_PREFIX = ".structurizr-stage-";

export const NONCE_PATTERN = /^[0-9a-f]{32}$/;

export type IoCode = "PATH" | "LOCK_BUSY" | "UNSAFE_OUTPUT" | "PUBLISH" | "CLEANUP";

export class StructurizrIoError extends Error {
	readonly errorClass = "IO";
	readonly code: IoCode;

	constructor(code: IoCode, detail: string) {
		super(`IO ${code}: ${detail}`);
		this.code = code;
		this.name = "StructurizrIoError";
	}
}

const ioFail = (code: IoCode, detail: string): never => {
	throw new StructurizrIoError(code, detail);
};

export type Identity = { device: string; inode: string };

/** Canonical unsigned base-10 identity strings, as the owner marker records them. */
export const identityOf = (stats: { dev: number; ino: number }): Identity => ({
	device: String(stats.dev),
	inode: String(stats.ino),
});

const sameIdentity = (a: Identity, b: Identity): boolean =>
	a.device === b.device && a.inode === b.inode;

/** Open a directory refusing to follow a final symlink, and record its identity. */
const openDirectory = (path: string): { fd: number; identity: Identity } => {
	let fd: number;
	try {
		fd = openSync(
			path,
			constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
		);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		return ioFail("PATH", `${path} is not a safe directory (${String(code)})`);
	}
	const stats = fstatSync(fd);
	if (!stats.isDirectory()) {
		closeSync(fd);
		return ioFail("PATH", `${path} is not a directory`);
	}
	return { fd, identity: identityOf(stats) };
};

/** Create a directory if absent, then open and identity-check it. */
const ensureDirectory = (path: string): { fd: number; identity: Identity } => {
	try {
		mkdirSync(path, { mode: 0o700 });
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "EEXIST") {
			ioFail("PATH", `cannot create ${path}: ${String(code)}`);
		}
		// An existing entry must itself be a safe directory, never a symlink.
		const stats = lstatSync(path);
		if (stats.isSymbolicLink()) ioFail("PATH", `${path} is a symbolic link`);
		if (!stats.isDirectory()) ioFail("PATH", `${path} is not a directory`);
	}
	return openDirectory(path);
};

export type LockRecord = {
	schemaVersion: 1;
	kind: "structurizr-lock";
	command: "render" | "clean";
	pid: number;
	nonce: string;
};

export type OwnerRecord = {
	schemaVersion: 1;
	kind: "structurizr-stage";
	nonce: string;
	stageName: string;
	lock: Identity;
};

/** Serialize the lock in exact key order as one line of UTF-8 JSON. */
export const serializeLock = (record: LockRecord): string =>
	`{"schemaVersion":1,"kind":"structurizr-lock","command":${JSON.stringify(record.command)},"pid":${record.pid},"nonce":${JSON.stringify(record.nonce)}}`;

/** Serialize the owner marker in exact key order as one line of UTF-8 JSON. */
export const serializeOwner = (record: OwnerRecord): string =>
	`{"schemaVersion":1,"kind":"structurizr-stage","nonce":${JSON.stringify(record.nonce)},"stageName":${JSON.stringify(record.stageName)},"lock":{"device":${JSON.stringify(record.lock.device)},"inode":${JSON.stringify(record.lock.inode)}}}`;

const CLOSED_LOCK_KEYS = ["schemaVersion", "kind", "command", "pid", "nonce"];
const CLOSED_OWNER_KEYS = ["schemaVersion", "kind", "nonce", "stageName", "lock"];

const closedKeys = (value: unknown, keys: string[], where: string): Record<string, unknown> => {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return ioFail("UNSAFE_OUTPUT", `${where} is not an object`);
	}
	const actual = Object.keys(value as Record<string, unknown>).sort();
	const expected = [...keys].sort();
	if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
		return ioFail("UNSAFE_OUTPUT", `${where} has unexpected fields: ${actual.join(", ")}`);
	}
	return value as Record<string, unknown>;
};

export const parseLock = (raw: string): LockRecord => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return ioFail("UNSAFE_OUTPUT", "lock is not valid JSON");
	}
	const record = closedKeys(parsed, CLOSED_LOCK_KEYS, "lock");
	if (record.schemaVersion !== 1 || record.kind !== "structurizr-lock") {
		ioFail("UNSAFE_OUTPUT", "lock is not a schema 1 structurizr-lock");
	}
	if (record.command !== "render" && record.command !== "clean") {
		ioFail("UNSAFE_OUTPUT", "lock command must be render or clean");
	}
	if (typeof record.pid !== "number" || !Number.isSafeInteger(record.pid) || record.pid <= 0) {
		ioFail("UNSAFE_OUTPUT", "lock pid must be a positive safe integer");
	}
	if (typeof record.nonce !== "string" || !NONCE_PATTERN.test(record.nonce)) {
		ioFail("UNSAFE_OUTPUT", "lock nonce must be 32 lowercase hexadecimal characters");
	}
	return record as unknown as LockRecord;
};

export const parseOwner = (raw: string): OwnerRecord => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return ioFail("UNSAFE_OUTPUT", "owner marker is not valid JSON");
	}
	const record = closedKeys(parsed, CLOSED_OWNER_KEYS, "owner marker");
	if (record.schemaVersion !== 1 || record.kind !== "structurizr-stage") {
		ioFail("UNSAFE_OUTPUT", "owner marker is not a schema 1 structurizr-stage");
	}
	if (typeof record.nonce !== "string" || !NONCE_PATTERN.test(record.nonce)) {
		ioFail("UNSAFE_OUTPUT", "owner nonce must be 32 lowercase hexadecimal characters");
	}
	if (record.stageName !== `${STAGE_PREFIX}${record.nonce}`) {
		ioFail("UNSAFE_OUTPUT", "owner stageName does not agree with its nonce");
	}
	const lock = closedKeys(record.lock, ["device", "inode"], "owner lock identity");
	for (const field of ["device", "inode"] as const) {
		const value = lock[field];
		if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
			ioFail("UNSAFE_OUTPUT", `owner lock ${field} must be a canonical base-10 string`);
		}
	}
	return record as unknown as OwnerRecord;
};

export type Session = {
	root: string;
	lockParent: string;
	lockPath: string;
	stagePath: string;
	payloadPath: string;
	finalPath: string;
	ownerPath: string;
	nonce: string;
	command: "render" | "clean";
	lockIdentity: Identity;
	lockParentIdentity: Identity;
	release: () => void;
};

const closeAll = (fds: number[]): void => {
	for (const fd of fds) {
		try {
			closeSync(fd);
		} catch {
			// Already closed.
		}
	}
};

/**
 * Establish the safe lock parent and take the lock in one atomic O_EXCL create.
 * There is no check-then-create race: EEXIST is the contention signal.
 */
export const acquire = (options: {
	root: string;
	command: "render" | "clean";
	nonce?: string;
}): Session => {
	const fds: number[] = [];
	const root = options.root;

	const rootHandle = openDirectory(root);
	fds.push(rootHandle.fd);

	const buildPath = join(root, BUILD_DIR);
	const buildHandle = ensureDirectory(buildPath);
	fds.push(buildHandle.fd);

	const lockParent = join(buildPath, ARCHITECTURE_DIR);
	const lockParentHandle = ensureDirectory(lockParent);
	fds.push(lockParentHandle.fd);

	const lockPath = join(lockParent, LOCK_NAME);
	const nonce = options.nonce ?? randomBytes(16).toString("hex");
	if (!NONCE_PATTERN.test(nonce)) {
		closeAll(fds);
		return ioFail("PATH", "nonce must be 32 lowercase hexadecimal characters");
	}

	let lockFd: number;
	try {
		lockFd = openSync(
			lockPath,
			constants.O_WRONLY |
				constants.O_CREAT |
				constants.O_EXCL |
				constants.O_NOFOLLOW,
			0o600,
		);
	} catch (error) {
		closeAll(fds);
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EEXIST") {
			// Contention is immediate and non-mutating.
			return ioFail("LOCK_BUSY", `${lockPath} is held by another command`);
		}
		return ioFail("PATH", `cannot create ${lockPath}: ${String(code)}`);
	}
	fds.push(lockFd);

	const record: LockRecord = {
		schemaVersion: 1,
		kind: "structurizr-lock",
		command: options.command,
		pid: process.pid,
		nonce,
	};
	writeSync(lockFd, serializeLock(record));
	fsyncSync(lockFd);

	const lockIdentity = identityOf(fstatSync(lockFd));

	const stagePath = join(lockParent, `${STAGE_PREFIX}${nonce}`);

	const release = (): void => {
		// Unlink only when the live lock still carries this run's bytes and identity.
		try {
			const current = lstatSync(lockPath);
			if (
				!current.isSymbolicLink() &&
				current.isFile() &&
				current.nlink === 1 &&
				sameIdentity(identityOf(current), lockIdentity) &&
				parseLock(readFileSync(lockPath, "utf8")).nonce === nonce
			) {
				unlinkSync(lockPath);
			}
			// A replaced lock is retained, not unlinked.
		} catch {
			// Nothing safe to remove.
		} finally {
			closeAll(fds);
		}
	};

	return {
		root,
		lockParent,
		lockPath,
		stagePath,
		payloadPath: join(stagePath, PAYLOAD_NAME),
		finalPath: join(lockParent, FINAL_NAME),
		ownerPath: join(stagePath, OWNER_NAME),
		nonce,
		command: options.command,
		lockIdentity,
		lockParentIdentity: lockParentHandle.identity,
		release,
	};
};

/** Confirm the retained ancestor identities still hold before a destructive phase. */
export const reverifyAncestors = (session: Session): void => {
	const parent = openDirectory(session.lockParent);
	try {
		if (!sameIdentity(parent.identity, session.lockParentIdentity)) {
			ioFail("PATH", `${session.lockParent} identity changed during the run`);
		}
	} finally {
		closeSync(parent.fd);
	}

	const lock = lstatSync(session.lockPath);
	if (lock.isSymbolicLink() || !lock.isFile()) {
		ioFail("UNSAFE_OUTPUT", `${session.lockPath} was replaced`);
	}
	if (!sameIdentity(identityOf(lock), session.lockIdentity)) {
		ioFail("UNSAFE_OUTPUT", `${session.lockPath} was replaced during the run`);
	}
};

/** Create the one nonce-suffixed stage, its payload, and its owner marker. */
export const createStage = (session: Session): void => {
	try {
		mkdirSync(session.stagePath, { mode: 0o700 });
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "EEXIST") {
			return ioFail("UNSAFE_OUTPUT", `${session.stagePath} already exists`);
		}
		return ioFail("PATH", `cannot create ${session.stagePath}: ${String(code)}`);
	}

	mkdirSync(session.payloadPath, { mode: 0o700 });

	const owner: OwnerRecord = {
		schemaVersion: 1,
		kind: "structurizr-stage",
		nonce: session.nonce,
		stageName: `${STAGE_PREFIX}${session.nonce}`,
		lock: session.lockIdentity,
	};

	let fd: number;
	try {
		fd = openSync(
			session.ownerPath,
			constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
			0o600,
		);
	} catch (error) {
		return ioFail("UNSAFE_OUTPUT", `cannot create owner marker: ${String((error as NodeJS.ErrnoException).code)}`);
	}
	try {
		writeSync(fd, serializeOwner(owner));
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
};

/** Prove this run owns a stage: marker, nonce, suffix, and live lock identity agree. */
export const ownsStage = (session: Session, stagePath: string): boolean => {
	const ownerPath = join(stagePath, OWNER_NAME);
	let stats;
	try {
		stats = lstatSync(ownerPath);
	} catch {
		return false;
	}
	if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) return false;

	let owner: OwnerRecord;
	try {
		owner = parseOwner(readFileSync(ownerPath, "utf8"));
	} catch {
		return false;
	}

	return (
		owner.nonce === session.nonce &&
		stagePath.endsWith(owner.stageName) &&
		sameIdentity(owner.lock, session.lockIdentity)
	);
};

/** Every published entry must be an expected directory or single-link regular file. */
export const assertSafeTree = (root: string): void => {
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory)) {
			const path = join(directory, entry);
			const stats = lstatSync(path);
			if (stats.isSymbolicLink()) {
				ioFail("UNSAFE_OUTPUT", `${path} is a symbolic link`);
			}
			if (stats.isDirectory()) {
				walk(path);
				continue;
			}
			if (!stats.isFile()) ioFail("UNSAFE_OUTPUT", `${path} is not a regular file`);
			if (stats.nlink !== 1) ioFail("UNSAFE_OUTPUT", `${path} has ${stats.nlink} hard links`);
		}
	};
	walk(root);
};

/** Remove a previous final root, but only when it is entirely safe. */
export const removeSafeFinal = (session: Session): boolean => {
	let stats;
	try {
		stats = lstatSync(session.finalPath);
	} catch {
		return false;
	}
	if (stats.isSymbolicLink()) {
		return ioFail("UNSAFE_OUTPUT", `${session.finalPath} is a symbolic link and was retained`);
	}
	if (!stats.isDirectory()) {
		return ioFail("UNSAFE_OUTPUT", `${session.finalPath} is not a directory and was retained`);
	}
	assertSafeTree(session.finalPath);
	rmSync(session.finalPath, { recursive: true });
	return true;
};

/** Publish by same-directory atomic rename after a final identity re-check. */
export const publish = (session: Session): void => {
	reverifyAncestors(session);
	assertSafeTree(session.payloadPath);

	try {
		lstatSync(session.finalPath);
		ioFail("UNSAFE_OUTPUT", `${session.finalPath} reappeared before publication`);
	} catch (error) {
		if (error instanceof StructurizrIoError) throw error;
		// Absent is the required state.
	}

	try {
		renameSync(session.payloadPath, session.finalPath);
	} catch (error) {
		ioFail("PUBLISH", `cannot publish output: ${String((error as NodeJS.ErrnoException).code)}`);
	}
};

/** Remove this run's own stage. Anything not provably owned is retained. */
export const discardStage = (session: Session): void => {
	let exists = true;
	try {
		lstatSync(session.stagePath);
	} catch {
		exists = false;
	}
	if (!exists) return;

	if (!ownsStage(session, session.stagePath)) {
		ioFail("CLEANUP", `${session.stagePath} is not provably owned and was retained`);
	}
	rmSync(session.stagePath, { recursive: true });
};

export type CleanReport = {
	removedFinal: boolean;
	removedStages: string[];
	retainedStages: string[];
};

/**
 * Clean takes the same lock. It removes a safe final root and only stages this run can
 * prove it owns; every other stage is retained for explicit operator recovery.
 */
export const clean = (session: Session): CleanReport => {
	reverifyAncestors(session);

	const report: CleanReport = { removedFinal: false, removedStages: [], retainedStages: [] };

	try {
		report.removedFinal = removeSafeFinal(session);
	} catch (error) {
		if (!(error instanceof StructurizrIoError)) throw error;
		throw error;
	}

	for (const entry of readdirSync(session.lockParent)) {
		if (!entry.startsWith(STAGE_PREFIX)) continue;
		const stagePath = join(session.lockParent, entry);
		if (ownsStage(session, stagePath)) {
			rmSync(stagePath, { recursive: true });
			report.removedStages.push(entry);
		} else {
			// Abandonment is never guessed; the operator recovers it explicitly.
			report.retainedStages.push(entry);
		}
	}

	return report;
};

/** The three exact managed ignore entries. */
export const IGNORE_ENTRIES = [
	"/build/architecture/structurizr/",
	"/build/architecture/.structurizr-lock",
	"/build/architecture/.structurizr-stage-*/",
];
