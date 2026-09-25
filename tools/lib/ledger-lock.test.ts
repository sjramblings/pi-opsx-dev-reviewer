import { afterEach, expect, test } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	acquireLedgerLock,
	atomicWriteFileSync,
	ledgerLockPath,
	LedgerLockTimeoutError,
	withLedgerLock,
} from "./ledger-lock.ts";

const roots: string[] = [];
const children = new Set<ChildProcessWithoutNullStreams>();
const utilityUrl = pathToFileURL(join(import.meta.dir, "ledger-lock.ts")).href;
const evidenceDirectory = process.env.LEDGER_LOCK_EVIDENCE_DIR;

const workerSource = `
import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { acquireLedgerLock, atomicWriteFileSync, ledgerLockPath } from ${JSON.stringify(utilityUrl)};
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
function waitFor(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error("worker timeout waiting for " + path);
    Atomics.wait(sleepBuffer, 0, 0, 10);
  }
}
function writeComplete(path, contents) {
  const descriptor = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeFileSync(descriptor, contents, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}
function publishClaim(lockPath) {
  const token = randomUUID();
  const claimPath = lockPath + "/stale-break.claim";
  const tempPath = lockPath + ".claim-" + process.pid + "-" + token + ".tmp";
  writeComplete(tempPath, JSON.stringify({ token, pid: process.pid, claimedAt: new Date().toISOString() }) + "\\n");
  linkSync(tempPath, claimPath);
  unlinkSync(tempPath);
  return token;
}
const [mode, target, name, attempted, acquired, start, permit, actions, overlap, optionsText] = process.argv.slice(2);
const options = JSON.parse(optionsText);
writeFileSync(attempted, name + " attempted\\n");
if (start !== "-") waitFor(start, 5_000);
const protocolLockPath = ledgerLockPath(target);
if (mode === "state-empty") {
  const token = randomUUID();
  const tempPath = protocolLockPath + ".owner-" + process.pid + "-" + token + ".tmp";
  writeComplete(tempPath, JSON.stringify({ token, pid: process.pid, acquiredAt: new Date().toISOString() }) + "\\n");
  mkdirSync(protocolLockPath, { mode: 0o700 });
  console.log(name + " created empty directory after complete owner temp");
  writeFileSync(acquired, name + " ready\\n");
  waitFor(permit, 5_000);
  process.exit(0);
}
if (mode === "state-claim" || mode === "state-replace-claim") {
  if (!existsSync(protocolLockPath)) mkdirSync(protocolLockPath, { mode: 0o700 });
  if (mode === "state-replace-claim") {
    renameSync(protocolLockPath + "/stale-break.claim", protocolLockPath + ".displaced-by-" + process.pid);
  }
  const token = publishClaim(protocolLockPath);
  console.log(name + " published claim " + token);
  writeFileSync(acquired, name + " ready\\n");
  waitFor(permit, 5_000);
  process.exit(0);
}
const lock = acquireLedgerLock(target, options);
console.log(name + " acquired " + lock.ownerToken);
writeFileSync(acquired, name + " acquired\\n");
if (mode === "writer") {
  let overlapDescriptor;
  try {
    overlapDescriptor = openSync(overlap, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    const prior = existsSync(actions) ? JSON.parse(readFileSync(actions, "utf8")) : [];
    prior.push(name);
    atomicWriteFileSync(actions, JSON.stringify(prior) + "\\n");
    if (permit !== "-") waitFor(permit, 5_000);
  } finally {
    if (overlapDescriptor !== undefined) closeSync(overlapDescriptor);
    rmSync(overlap, { force: true });
  }
} else if (mode === "holder") {
  waitFor(permit, 5_000);
} else {
  throw new Error("unknown worker mode " + mode);
}
lock.release();
console.log(name + " released");
`;

type Fixture = {
	root: string;
	target: string;
	worker: string;
};

type ChildResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

afterEach(() => {
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	}
	children.clear();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeFixture(label: string): Fixture {
	const root = mkdtempSync(join(tmpdir(), `ledger lock ${label} with spaces `));
	roots.push(root);
	const worker = join(root, "real process worker.ts");
	writeFileSync(worker, workerSource, "utf8");
	return { root, target: join(root, "shared trust ledger.tsv"), worker };
}

function launch(
	fixture: Fixture,
	mode: "writer" | "holder" | "state-empty" | "state-claim" | "state-replace-claim",
	name: string,
	paths: {
		attempted: string;
		acquired: string;
		start: string;
		permit: string;
		actions: string;
		overlap: string;
	},
	options: { timeoutMs: number; staleMs: number; retryDelayMs: number },
): ChildProcessWithoutNullStreams {
	const child = spawn(
		"bun",
		[
			fixture.worker,
			mode,
			fixture.target,
			name,
			paths.attempted,
			paths.acquired,
			paths.start,
			paths.permit,
			paths.actions,
			paths.overlap,
			JSON.stringify(options),
		],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	children.add(child);
	return child;
}

async function waitForPath(path: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(path)) {
		if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${path}`);
		await Bun.sleep(10);
	}
}

async function expectPathAbsentFor(path: string, durationMs: number): Promise<void> {
	const deadline = Date.now() + durationMs;
	while (Date.now() < deadline) {
		if (existsSync(path)) throw new Error(`path appeared while the first process held the lock: ${path}`);
		await Bun.sleep(10);
	}
}

async function finish(
	child: ChildProcessWithoutNullStreams,
	label: string,
	timeoutMs = 5_000,
): Promise<ChildResult> {
	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const status = await Promise.race([
		new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		}),
		new Promise<never>((_resolve, reject) => {
			timer = setTimeout(() => {
				child.kill("SIGKILL");
				reject(new Error(`${label} exceeded ${timeoutMs}ms`));
			}, timeoutMs);
		}),
	]);
	if (timer !== undefined) clearTimeout(timer);
	children.delete(child);
	const transcript = `status=${String(status)}\n--- stdout ---\n${stdout}--- stderr ---\n${stderr}`;
	const localTranscript = join(roots[roots.length - 1], `${label}.transcript.txt`);
	writeFileSync(localTranscript, transcript, "utf8");
	if (evidenceDirectory !== undefined) {
		mkdirSync(evidenceDirectory, { recursive: true });
		writeFileSync(join(evidenceDirectory, `${label}.transcript.txt`), transcript, "utf8");
	}
	return { status, stdout, stderr };
}

function workerPaths(fixture: Fixture, name: string): {
	attempted: string;
	acquired: string;
	start: string;
	permit: string;
	actions: string;
	overlap: string;
} {
	return {
		attempted: join(fixture.root, `${name} attempted`),
		acquired: join(fixture.root, `${name} acquired`),
		start: "-",
		permit: join(fixture.root, `${name} permit`),
		actions: join(fixture.root, "resulting actions.json"),
		overlap: join(fixture.root, "critical section overlap sentinel"),
	};
}

function expectProcessDead(pid: number): void {
	try {
		process.kill(pid, 0);
	} catch (error: unknown) {
		if (error instanceof Error && "code" in error && error.code === "ESRCH") return;
		throw error;
	}
	throw new Error(`expected worker PID ${pid} to be demonstrably dead`);
}

async function killReadyWorker(
	child: ChildProcessWithoutNullStreams,
	readyPath: string,
	label: string,
): Promise<ChildResult> {
	await waitForPath(readyPath, 2_000);
	const pid = child.pid;
	if (pid === undefined) throw new Error(`${label} did not receive a PID`);
	child.kill("SIGKILL");
	const result = await finish(child, label);
	expect(result.status).not.toBe(0);
	expectProcessDead(pid);
	return result;
}

function tempEntries(fixture: Fixture): string[] {
	const baseName = fixture.target.split("/").at(-1) ?? "";
	return readdirSync(fixture.root).filter((entry) => entry.startsWith(`.${baseName}.`) && entry.endsWith(".tmp"));
}

test("real processes serialize without overlap and both whole-file actions persist", async () => {
	const fixture = makeFixture("serialization");
	const firstPaths = workerPaths(fixture, "writer A");
	const secondPaths = workerPaths(fixture, "writer B");
	secondPaths.actions = firstPaths.actions;
	secondPaths.overlap = firstPaths.overlap;
	secondPaths.permit = "-";
	const options = { timeoutMs: 3_000, staleMs: 10_000, retryDelayMs: 10 };

	const first = launch(fixture, "writer", "writer A", firstPaths, options);
	await waitForPath(firstPaths.acquired, 2_000);
	const second = launch(fixture, "writer", "writer B", secondPaths, options);
	await waitForPath(secondPaths.attempted, 2_000);
	await expectPathAbsentFor(secondPaths.acquired, 150);
	writeFileSync(firstPaths.permit, "release writer A\n");

	const [firstResult, secondResult] = await Promise.all([
		finish(first, "serialization-writer-a"),
		finish(second, "serialization-writer-b"),
	]);
	expect(firstResult, firstResult.stderr).toMatchObject({ status: 0 });
	expect(secondResult, secondResult.stderr).toMatchObject({ status: 0 });
	expect(firstResult.stdout).toContain("writer A acquired");
	expect(secondResult.stdout).toContain("writer B acquired");
	expect(JSON.parse(readFileSync(firstPaths.actions, "utf8"))).toEqual(["writer A", "writer B"]);
	expect(existsSync(firstPaths.overlap)).toBe(false);
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
}, 10_000);

test("a live process remains owner beyond staleMs and the contender has a bounded timeout", async () => {
	const fixture = makeFixture("live owner timeout");
	const ownerPaths = workerPaths(fixture, "live owner");
	const owner = launch(fixture, "holder", "live owner", ownerPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	await waitForPath(ownerPaths.acquired, 1_500);
	await Bun.sleep(125);

	const contenderPaths = workerPaths(fixture, "timed out contender");
	const startedAt = Date.now();
	const contender = launch(fixture, "holder", "timed out contender", contenderPaths, {
		timeoutMs: 250,
		staleMs: 75,
		retryDelayMs: 10,
	});
	const contenderResult = await finish(contender, "live-owner-timeout-contender", 2_000);
	const elapsedMs = Date.now() - startedAt;
	expect(contenderResult.status).not.toBe(0);
	expect(contenderResult.stderr).toContain("LedgerLockTimeoutError");
	expect(elapsedMs).toBeGreaterThanOrEqual(200);
	expect(elapsedMs).toBeLessThan(1_500);
	expect(existsSync(contenderPaths.acquired)).toBe(false);
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(true);

	writeFileSync(ownerPaths.permit, "release live owner\n");
	const ownerResult = await finish(owner, "live-owner-holder");
	expect(ownerResult, ownerResult.stderr).toMatchObject({ status: 0 });
	expect(ownerResult.stdout).toContain("live owner released");
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
}, 10_000);

test("an atomically published valid owner survives SIGKILL and is stale-broken", async () => {
	const fixture = makeFixture("crashed owner takeover");
	const crashedPaths = workerPaths(fixture, "crashed owner");
	const crashed = launch(fixture, "holder", "crashed owner", crashedPaths, {
		timeoutMs: 1_000,
		staleMs: 200,
		retryDelayMs: 10,
	});
	await waitForPath(crashedPaths.acquired, 1_500);
	const ownerEntries = readdirSync(ledgerLockPath(fixture.target));
	expect(ownerEntries).toHaveLength(1);
	const ownerRecord = JSON.parse(readFileSync(join(ledgerLockPath(fixture.target), ownerEntries[0]), "utf8"));
	expect(ownerRecord).toEqual({
		token: expect.any(String),
		pid: crashed.pid,
		acquiredAt: expect.any(String),
	});
	const crashedResult = await killReadyWorker(crashed, crashedPaths.acquired, "crashed-owner-process");
	expect(crashedResult.stdout).toContain("crashed owner acquired");

	const takeoverPaths = workerPaths(fixture, "takeover owner");
	const startedAt = Date.now();
	const takeover = launch(fixture, "holder", "takeover owner", takeoverPaths, {
		timeoutMs: 2_000,
		staleMs: 200,
		retryDelayMs: 10,
	});
	await waitForPath(takeoverPaths.acquired, 1_500);
	expect(Date.now() - startedAt).toBeLessThan(1_500);
	writeFileSync(takeoverPaths.permit, "release takeover owner\n");
	const takeoverResult = await finish(takeover, "crashed-owner-takeover");
	expect(takeoverResult, takeoverResult.stderr).toMatchObject({ status: 0 });
	expect(takeoverResult.stdout).toContain("takeover owner released");
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
	expect(readdirSync(fixture.root).some((entry) => entry.includes(".lock.stale-"))).toBe(false);
}, 10_000);

test("a SIGKILL before owner publication leaves an empty directory that later recovers", async () => {
	const fixture = makeFixture("empty initialization crash");
	const paths = workerPaths(fixture, "crashed initializer");
	const initializer = launch(fixture, "state-empty", "crashed initializer", paths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	const result = await killReadyWorker(initializer, paths.acquired, "empty-initialization-crash");
	expect(result.stdout).toContain("created empty directory after complete owner temp");
	expect(readdirSync(ledgerLockPath(fixture.target))).toEqual([]);
	await Bun.sleep(100);

	const recovered = acquireLedgerLock(fixture.target, { timeoutMs: 1_000, staleMs: 75, retryDelayMs: 10 });
	recovered.release();
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("an abandoned fully published claim in an ownerless directory is reclaimed", async () => {
	const fixture = makeFixture("abandoned claim only");
	const paths = workerPaths(fixture, "claimant only");
	const claimant = launch(fixture, "state-claim", "claimant only", paths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	const result = await killReadyWorker(claimant, paths.acquired, "abandoned-claim-only");
	expect(result.stdout).toContain("published claim");
	const claimRecord = JSON.parse(readFileSync(join(ledgerLockPath(fixture.target), "stale-break.claim"), "utf8"));
	expect(claimRecord).toEqual({ token: expect.any(String), pid: claimant.pid, claimedAt: expect.any(String) });
	await Bun.sleep(100);

	const recovered = acquireLedgerLock(fixture.target, { timeoutMs: 1_000, staleMs: 75, retryDelayMs: 10 });
	recovered.release();
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("an abandoned claim beside a valid dead owner is reclaimed through the same protocol", async () => {
	const fixture = makeFixture("dead owner and abandoned claim");
	const ownerPaths = workerPaths(fixture, "dead owner");
	const owner = launch(fixture, "holder", "dead owner", ownerPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	await killReadyWorker(owner, ownerPaths.acquired, "dead-owner-before-abandoned-claim");

	const claimPaths = workerPaths(fixture, "dead claimant");
	const claimant = launch(fixture, "state-claim", "dead claimant", claimPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	await killReadyWorker(claimant, claimPaths.acquired, "dead-owner-abandoned-claim");
	const entries = readdirSync(ledgerLockPath(fixture.target)).sort();
	expect(entries).toHaveLength(2);
	expect(entries).toContain("stale-break.claim");
	expect(entries.some((entry) => entry.startsWith("owner-") && entry.endsWith(".json"))).toBe(true);
	await Bun.sleep(100);

	const recovered = acquireLedgerLock(fixture.target, { timeoutMs: 1_000, staleMs: 75, retryDelayMs: 10 });
	recovered.release();
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("a breaker killed after replacing a claim leaves a reclaimable strict claim", async () => {
	const fixture = makeFixture("breaker replacement crash");
	const firstPaths = workerPaths(fixture, "first abandoned claimant");
	const first = launch(fixture, "state-claim", "first abandoned claimant", firstPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	await killReadyWorker(first, firstPaths.acquired, "first-abandoned-claim");
	await Bun.sleep(100);

	const breakerPaths = workerPaths(fixture, "replacement breaker");
	const breaker = launch(fixture, "state-replace-claim", "replacement breaker", breakerPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	const breakerResult = await killReadyWorker(breaker, breakerPaths.acquired, "replacement-breaker-crash");
	expect(breakerResult.stdout).toContain("published claim");
	const replacementClaim = JSON.parse(
		readFileSync(join(ledgerLockPath(fixture.target), "stale-break.claim"), "utf8"),
	);
	expect(replacementClaim).toEqual({ token: expect.any(String), pid: breaker.pid, claimedAt: expect.any(String) });
	await Bun.sleep(100);

	const recovered = acquireLedgerLock(fixture.target, { timeoutMs: 1_000, staleMs: 75, retryDelayMs: 10 });
	recovered.release();
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("a live owner survives cleanup of an abandoned dead claim", async () => {
	const fixture = makeFixture("live owner abandoned claim");
	const ownerPaths = workerPaths(fixture, "live owner with claim");
	const owner = launch(fixture, "holder", "live owner with claim", ownerPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	await waitForPath(ownerPaths.acquired, 1_500);
	const originalOwnerEntry = readdirSync(ledgerLockPath(fixture.target))[0];
	const originalOwner = readFileSync(join(ledgerLockPath(fixture.target), originalOwnerEntry), "utf8");

	const claimPaths = workerPaths(fixture, "abandoned beside live owner");
	const claimant = launch(fixture, "state-claim", "abandoned beside live owner", claimPaths, {
		timeoutMs: 1_000,
		staleMs: 75,
		retryDelayMs: 10,
	});
	await killReadyWorker(claimant, claimPaths.acquired, "live-owner-abandoned-claim");
	await Bun.sleep(100);

	const contenderPaths = workerPaths(fixture, "live owner contender");
	const contender = launch(fixture, "holder", "live owner contender", contenderPaths, {
		timeoutMs: 225,
		staleMs: 75,
		retryDelayMs: 10,
	});
	const contenderResult = await finish(contender, "live-owner-abandoned-claim-contender", 2_000);
	expect(contenderResult.status).not.toBe(0);
	expect(contenderResult.stderr).toContain("LedgerLockTimeoutError");
	expect(readdirSync(ledgerLockPath(fixture.target))).toEqual([originalOwnerEntry]);
	expect(readFileSync(join(ledgerLockPath(fixture.target), originalOwnerEntry), "utf8")).toBe(originalOwner);

	writeFileSync(ownerPaths.permit, "release live owner\n");
	const ownerResult = await finish(owner, "live-owner-after-claim-cleanup");
	expect(ownerResult, ownerResult.stderr).toMatchObject({ status: 0 });
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
}, 10_000);

test("two real breakers claim one ownerless stale directory and then serialize", async () => {
	const fixture = makeFixture("concurrent ownerless breakers");
	const lockPath = ledgerLockPath(fixture.target);
	mkdirSync(lockPath);
	const old = new Date(Date.now() - 5_000);
	utimesSync(lockPath, old, old);

	const start = join(fixture.root, "start concurrent breakers");
	const firstPaths = workerPaths(fixture, "breaker A");
	const secondPaths = workerPaths(fixture, "breaker B");
	firstPaths.start = start;
	secondPaths.start = start;
	secondPaths.actions = firstPaths.actions;
	secondPaths.overlap = firstPaths.overlap;
	const options = { timeoutMs: 3_000, staleMs: 100, retryDelayMs: 10 };
	const first = launch(fixture, "writer", "breaker A", firstPaths, options);
	const second = launch(fixture, "writer", "breaker B", secondPaths, options);
	await Promise.all([
		waitForPath(firstPaths.attempted, 1_500),
		waitForPath(secondPaths.attempted, 1_500),
	]);
	writeFileSync(start, "start both breakers\n");

	const acquisitionDeadline = Date.now() + 1_500;
	while (!existsSync(firstPaths.acquired) && !existsSync(secondPaths.acquired)) {
		if (Date.now() >= acquisitionDeadline) throw new Error("neither concurrent breaker acquired the lock");
		await Bun.sleep(10);
	}
	const firstWon = existsSync(firstPaths.acquired);
	const winnerPaths = firstWon ? firstPaths : secondPaths;
	const loserPaths = firstWon ? secondPaths : firstPaths;
	const winner = firstWon ? first : second;
	const loser = firstWon ? second : first;
	await expectPathAbsentFor(loserPaths.acquired, 100);
	writeFileSync(winnerPaths.permit, "release first breaker\n");
	const winnerResult = await finish(winner, "ownerless-breaker-winner");
	expect(winnerResult, winnerResult.stderr).toMatchObject({ status: 0 });
	await waitForPath(loserPaths.acquired, 1_500);
	writeFileSync(loserPaths.permit, "release second breaker\n");
	const loserResult = await finish(loser, "ownerless-breaker-loser");
	expect(loserResult, loserResult.stderr).toMatchObject({ status: 0 });

	expect(JSON.parse(readFileSync(firstPaths.actions, "utf8")).sort()).toEqual(["breaker A", "breaker B"]);
	expect(existsSync(firstPaths.overlap)).toBe(false);
	expect(existsSync(lockPath)).toBe(false);
	expect(readdirSync(fixture.root).some((entry) => entry.includes(".lock.stale-"))).toBe(false);
}, 10_000);

test("two breakers never quarantine a replacement across repeated dead-owner races", async () => {
	for (let round = 1; round <= 6; round += 1) {
		const fixture = makeFixture(`replacement race ${round}`);
		const deadPaths = workerPaths(fixture, `round ${round} dead owner`);
		const deadOwner = launch(fixture, "holder", `round ${round} dead owner`, deadPaths, {
			timeoutMs: 1_000,
			staleMs: 50,
			retryDelayMs: 5,
		});
		await killReadyWorker(deadOwner, deadPaths.acquired, `replacement-race-${round}-dead-owner`);
		await Bun.sleep(70);

		const start = join(fixture.root, `round ${round} start`);
		const firstPaths = workerPaths(fixture, `round ${round} breaker A`);
		const secondPaths = workerPaths(fixture, `round ${round} breaker B`);
		firstPaths.start = start;
		secondPaths.start = start;
		const options = { timeoutMs: 4_000, staleMs: 50, retryDelayMs: 5 };
		const first = launch(fixture, "holder", `round ${round} breaker A`, firstPaths, options);
		const second = launch(fixture, "holder", `round ${round} breaker B`, secondPaths, options);
		await Promise.all([
			waitForPath(firstPaths.attempted, 1_500),
			waitForPath(secondPaths.attempted, 1_500),
		]);
		writeFileSync(start, "start both breakers\n");

		const acquisitionDeadline = Date.now() + 1_500;
		while (!existsSync(firstPaths.acquired) && !existsSync(secondPaths.acquired)) {
			if (Date.now() >= acquisitionDeadline) throw new Error(`replacement race ${round} had no winner`);
			await Bun.sleep(5);
		}
		const firstWon = existsSync(firstPaths.acquired);
		const winner = firstWon ? first : second;
		const loser = firstWon ? second : first;
		const winnerPaths = firstWon ? firstPaths : secondPaths;
		const loserPaths = firstWon ? secondPaths : firstPaths;
		const replacementStat = lstatSync(ledgerLockPath(fixture.target));
		const replacementOwnerEntry = readdirSync(ledgerLockPath(fixture.target)).find(
			(entry) => entry.startsWith("owner-") && entry.endsWith(".json"),
		);
		if (replacementOwnerEntry === undefined) throw new Error(`replacement race ${round} winner had no owner`);
		const replacementOwner = readFileSync(
			join(ledgerLockPath(fixture.target), replacementOwnerEntry),
			"utf8",
		);
		await expectPathAbsentFor(loserPaths.acquired, 80);
		const stillReplacement = lstatSync(ledgerLockPath(fixture.target));
		expect([stillReplacement.dev, stillReplacement.ino]).toEqual([replacementStat.dev, replacementStat.ino]);
		expect(readFileSync(join(ledgerLockPath(fixture.target), replacementOwnerEntry), "utf8"))
			.toBe(replacementOwner);

		writeFileSync(winnerPaths.permit, "release race winner\n");
		const winnerResult = await finish(winner, `replacement-race-${round}-winner`);
		expect(winnerResult, winnerResult.stderr).toMatchObject({ status: 0 });
		writeFileSync(loserPaths.permit, "release race loser after acquisition\n");
		const loserResult = await finish(loser, `replacement-race-${round}-loser`, 5_000);
		expect(loserResult, loserResult.stderr).toMatchObject({ status: 0 });
		expect(loserResult.stdout).toContain(" acquired ");
		expect(existsSync(loserPaths.acquired)).toBe(true);
		expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
	}
}, 30_000);

test("an old release never removes a replacement lock", () => {
	const fixture = makeFixture("old release replacement safety");
	const oldOwner = acquireLedgerLock(fixture.target, { timeoutMs: 500, staleMs: 10_000 });
	rmSync(ledgerLockPath(fixture.target), { recursive: true });
	const replacement = acquireLedgerLock(fixture.target, { timeoutMs: 500, staleMs: 10_000 });
	oldOwner.release();
	const replacementEntries = readdirSync(ledgerLockPath(fixture.target));
	expect(replacementEntries).toHaveLength(1);
	expect(readFileSync(join(ledgerLockPath(fixture.target), replacementEntries[0]), "utf8"))
		.toContain(replacement.ownerToken);
	replacement.release();
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("atomic replacement preserves mode and leaves no adjacent temp files", () => {
	const fixture = makeFixture("atomic replacement");
	writeFileSync(fixture.target, "known good contents\n", { mode: 0o640 });

	atomicWriteFileSync(fixture.target, "complete replacement\n");

	expect(readFileSync(fixture.target, "utf8")).toBe("complete replacement\n");
	expect(lstatSync(fixture.target).mode & 0o777).toBe(0o640);
	expect(tempEntries(fixture)).toEqual([]);
});

test("atomic-write failures preserve wrong-type and symlink targets and clean temp files", () => {
	const fixture = makeFixture("atomic error cleanup");
	mkdirSync(fixture.target);
	writeFileSync(join(fixture.target, "sentinel"), "preserve directory\n");

	expect(() => atomicWriteFileSync(fixture.target, "must not replace\n"))
		.toThrow("atomic-write target is not a regular file");
	expect(readFileSync(join(fixture.target, "sentinel"), "utf8")).toBe("preserve directory\n");
	expect(tempEntries(fixture)).toEqual([]);

	rmSync(fixture.target, { recursive: true });
	const external = join(fixture.root, "external atomic target");
	writeFileSync(external, "preserve external file\n");
	symlinkSync(external, fixture.target);
	expect(() => atomicWriteFileSync(fixture.target, "must not follow\n"))
		.toThrow("atomic-write target is not a regular file");
	expect(lstatSync(fixture.target).isSymbolicLink()).toBe(true);
	expect(readFileSync(external, "utf8")).toBe("preserve external file\n");
	expect(tempEntries(fixture)).toEqual([]);
});

test("symlink and wrong-type lock paths fail loudly without touching their targets", () => {
	const fixture = makeFixture("lock path validation");
	const lockPath = ledgerLockPath(fixture.target);
	const external = join(fixture.root, "external lock directory");
	mkdirSync(external);
	writeFileSync(join(external, "sentinel"), "external data\n");
	symlinkSync(external, lockPath);

	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: 50, staleMs: 1_000 }))
		.toThrow("ledger lock path is not a regular directory");
	expect(readFileSync(join(external, "sentinel"), "utf8")).toBe("external data\n");
	rmSync(lockPath);
	writeFileSync(lockPath, "wrong type\n");
	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: 50, staleMs: 1_000 }))
		.toThrow("ledger lock path is not a regular directory");
	expect(readFileSync(lockPath, "utf8")).toBe("wrong type\n");
});

test("symlinked memory directories resolve to one shared physical lock", () => {
	const fixture = makeFixture("shared symlink directory");
	const sharedDirectory = join(fixture.root, "primary shared memory");
	const firstLink = join(fixture.root, "worktree one memory");
	const secondLink = join(fixture.root, "worktree two memory");
	mkdirSync(sharedDirectory);
	symlinkSync(sharedDirectory, firstLink);
	symlinkSync(sharedDirectory, secondLink);
	const firstTarget = join(firstLink, "trust.tsv");
	const secondTarget = join(secondLink, "trust.tsv");
	const first = acquireLedgerLock(firstTarget, { timeoutMs: 100, staleMs: 1_000, retryDelayMs: 10 });
	try {
		expect(ledgerLockPath(firstTarget)).toBe(ledgerLockPath(secondTarget));
		expect(() => acquireLedgerLock(secondTarget, { timeoutMs: 50, staleMs: 1_000, retryDelayMs: 10 }))
			.toThrow(LedgerLockTimeoutError);
	} finally {
		first.release();
	}
});

test("owner symlinks are never followed or stale-broken", () => {
	const fixture = makeFixture("owner symlink validation");
	const lockPath = ledgerLockPath(fixture.target);
	const external = join(fixture.root, "external owner metadata");
	mkdirSync(lockPath);
	writeFileSync(external, "external owner data\n");
	symlinkSync(external, join(lockPath, "owner-attacker.json"));

	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: 50, staleMs: 1 }))
		.toThrow("ledger lock owner is not a regular file");
	expect(readFileSync(external, "utf8")).toBe("external owner data\n");
});

test("externally corrupted stale claim metadata fails loudly without deleting it", () => {
	const fixture = makeFixture("corrupt claim metadata");
	const lockPath = ledgerLockPath(fixture.target);
	const claimPath = join(lockPath, "stale-break.claim");
	mkdirSync(lockPath);
	writeFileSync(claimPath, JSON.stringify({ pid: 99, token: "missing timestamp" }) + "\n");
	const old = new Date(Date.now() - 1_000);
	utimesSync(claimPath, old, old);
	utimesSync(lockPath, old, old);

	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: 100, staleMs: 10, retryDelayMs: 10 }))
		.toThrow("ledger lock claim metadata has an invalid shape");
	expect(readFileSync(claimPath, "utf8")).toContain("missing timestamp");
});

test("fresh corrupt owner metadata is not parsed, while stale corruption fails loudly", () => {
	const fixture = makeFixture("corrupt owner metadata");
	const lockPath = ledgerLockPath(fixture.target);
	const ownerPath = join(lockPath, "owner-corrupt.json");
	mkdirSync(lockPath);
	writeFileSync(ownerPath, "not json\n");

	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: 40, staleMs: 500, retryDelayMs: 10 }))
		.toThrow(LedgerLockTimeoutError);
	const old = new Date(Date.now() - 1_000);
	utimesSync(ownerPath, old, old);
	utimesSync(lockPath, old, old);
	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: 100, staleMs: 10, retryDelayMs: 10 }))
		.toThrow("ledger lock owner metadata is invalid JSON");
	expect(readFileSync(ownerPath, "utf8")).toBe("not json\n");
});

test("withLedgerLock rejects a native async callback before invocation", () => {
	const fixture = makeFixture("native async callback rejection");
	let invoked = false;
	const callback = async (): Promise<void> => {
		invoked = true;
	};

	expect(() => withLedgerLock(fixture.target, callback))
		.toThrow("withLedgerLock requires a synchronous callback; async functions are not supported");
	expect(invoked).toBe(false);
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("withLedgerLock rejects Promise and thenable results after release", () => {
	const fixture = makeFixture("thenable callback rejection");
	expect(() => withLedgerLock(fixture.target, () => Promise.resolve("not supported")))
		.toThrow("Promise and thenable results are not supported");
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);

	const thenable = { then(): void {} };
	expect(() => withLedgerLock(fixture.target, () => thenable))
		.toThrow("Promise and thenable results are not supported");
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);

	const next = acquireLedgerLock(fixture.target, { timeoutMs: 100, staleMs: 1_000 });
	next.release();
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
});

test("withLedgerLock releases after callback errors and validates public options", () => {
	const fixture = makeFixture("callback errors");
	const callbackError = new Error("callback failed loudly");
	expect(() => withLedgerLock(fixture.target, () => {
		throw callbackError;
	})).toThrow(callbackError);
	expect(existsSync(ledgerLockPath(fixture.target))).toBe(false);
	expect(() => acquireLedgerLock(fixture.target, { timeoutMs: -1 })).toThrow(TypeError);
	expect(() => acquireLedgerLock(fixture.target, { staleMs: 0 })).toThrow(TypeError);
	expect(() => acquireLedgerLock(fixture.target, { retryDelayMs: Number.NaN })).toThrow(TypeError);
	expect(() => atomicWriteFileSync(fixture.target, "data", { mode: 0o10_000 })).toThrow(TypeError);
	expect(() => atomicWriteFileSync(fixture.target, 42 as unknown as string)).toThrow(TypeError);
	expect(new LedgerLockTimeoutError(fixture.target, "lock", 1).timeoutMs).toBe(1);
});
