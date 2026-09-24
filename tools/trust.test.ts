import { afterEach, test, expect } from "bun:test";
import {
	spawn,
	spawnSync,
	type ChildProcessWithoutNullStreams,
	type SpawnSyncOptionsWithStringEncoding,
	type SpawnSyncReturns,
} from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tierOf, parseRows, serializeRows, applyLog, type Row } from "./trust.ts";

const roots: string[] = [];
const children = new Set<ChildProcessWithoutNullStreams>();
const trustTool = fileURLToPath(new URL("./trust.ts", import.meta.url));
const repoRoot = join(import.meta.dir, "..");
const evidenceDirectory = process.env.TRUST_EVIDENCE_DIR;
const workerSource = `
import { existsSync, writeFileSync } from "node:fs";
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const [tool, ledger, skill, result, ready, start] = process.argv.slice(2);
writeFileSync(ready, "ready\\n");
const deadline = Date.now() + 10_000;
while (!existsSync(start)) {
  if (Date.now() >= deadline) throw new Error("worker timed out waiting for synchronized start");
  Atomics.wait(sleepBuffer, 0, 0, 5);
}
const child = Bun.spawnSync([process.execPath, tool, "log", skill, result], {
  env: { ...process.env, TRUST_FILE: ledger },
  stdout: "pipe",
  stderr: "pipe",
});
process.stdout.write(child.stdout);
process.stderr.write(child.stderr);
process.exit(child.exitCode);
`;

type ProcessResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

type ConcurrentFixture = {
	root: string;
	shared: string;
	ledger: string;
	firstLedger: string;
	secondLedger: string;
	worker: string;
	start: string;
};

afterEach(() => {
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	}
	children.clear();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(label: string): string {
	const root = mkdtempSync(join(tmpdir(), `trust ${label} with spaces `));
	roots.push(root);
	return root;
}

function makeConcurrentFixture(label: string, initialRows: string): ConcurrentFixture {
	const root = makeRoot(label);
	const shared = join(root, "primary shared memory");
	const firstWorktree = join(root, "worktree one");
	const secondWorktree = join(root, "worktree two");
	mkdirSync(shared);
	mkdirSync(firstWorktree);
	mkdirSync(secondWorktree);
	symlinkSync(shared, join(firstWorktree, "memory"));
	symlinkSync(shared, join(secondWorktree, "memory"));
	const ledger = join(shared, "trust.tsv");
	writeFileSync(ledger, initialRows, "utf8");
	const worker = join(root, "synchronized trust worker.ts");
	writeFileSync(worker, workerSource, "utf8");
	return {
		root,
		shared,
		ledger,
		firstLedger: join(firstWorktree, "memory", "trust.tsv"),
		secondLedger: join(secondWorktree, "memory", "trust.tsv"),
		worker,
		start: join(root, "release both workers"),
	};
}

function largeFixtureRows(): string {
	const rows: string[] = [];
	for (let index = 0; index < 200_000; index += 1) {
		rows.push(`fixture-skill-${String(index).padStart(6, "0")}\t20\t20`);
	}
	return rows.join("\n") + "\n";
}

async function waitForPath(path: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(path)) {
		if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs}ms waiting for ${path}`);
		await Bun.sleep(5);
	}
}

function retainTranscript(label: string, transcript: string, localRoot: string): void {
	writeFileSync(join(localRoot, `${label}.transcript.txt`), transcript, "utf8");
	if (evidenceDirectory !== undefined) {
		mkdirSync(evidenceDirectory, { recursive: true });
		writeFileSync(join(evidenceDirectory, `${label}.transcript.txt`), transcript, "utf8");
	}
}

async function finish(
	child: ChildProcessWithoutNullStreams,
	label: string,
	localRoot: string,
	timeoutMs = 15_000,
): Promise<ProcessResult> {
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
	retainTranscript(
		label,
		`status=${String(status)}\n--- stdout ---\n${stdout}--- stderr ---\n${stderr}`,
		localRoot,
	);
	return { status, stdout, stderr };
}

function launchConcurrent(
	fixture: ConcurrentFixture,
	ledger: string,
	skill: string,
	result: "pass" | "fail",
	ready: string,
): ChildProcessWithoutNullStreams {
	const child = spawn(
		process.execPath,
		[fixture.worker, trustTool, ledger, skill, result, ready, fixture.start],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);
	children.add(child);
	return child;
}

async function runConcurrentUpdates(
	fixture: ConcurrentFixture,
	first: { skill: string; result: "pass" | "fail" },
	second: { skill: string; result: "pass" | "fail" },
): Promise<[ProcessResult, ProcessResult]> {
	const firstReady = join(fixture.root, "first ready");
	const secondReady = join(fixture.root, "second ready");
	const firstChild = launchConcurrent(fixture, fixture.firstLedger, first.skill, first.result, firstReady);
	const secondChild = launchConcurrent(fixture, fixture.secondLedger, second.skill, second.result, secondReady);
	await Promise.all([waitForPath(firstReady, 5_000), waitForPath(secondReady, 5_000)]);
	writeFileSync(fixture.start, "start both trust CLIs\n");
	return Promise.all([
		finish(firstChild, `concurrent-trust-first-${first.skill}`, fixture.root),
		finish(secondChild, `concurrent-trust-second-${second.skill}`, fixture.root),
	]);
}

function expectNoLedgerArtifacts(fixture: ConcurrentFixture): void {
	const artifactPrefix = `.${basename(fixture.ledger)}`;
	expect(readdirSync(fixture.shared).filter((entry) => entry.startsWith(artifactPrefix))).toEqual([]);
}

function runSyncRetained(
	label: string,
	command: string,
	args: string[],
	options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding">,
	localRoot: string,
): SpawnSyncReturns<string> {
	const result = spawnSync(command, args, { ...options, encoding: "utf8" });
	retainTranscript(
		label,
		`status=${String(result.status)}\n--- stdout ---\n${result.stdout ?? ""}--- stderr ---\n${result.stderr ?? ""}`,
		localRoot,
	);
	return result;
}

test("tierOf boundaries", () => {
	expect(tierOf(0, 0)).toBe("watch"); // < 10 runs
	expect(tierOf(9, 9)).toBe("watch"); // still < 10 runs
	expect(tierOf(10, 9)).toBe("queue"); // 9/10 = 0.9 -> not < 0.9 and >=10 runs, so queue
	expect(tierOf(10, 8)).toBe("watch"); // 80% < 90%
	expect(tierOf(15, 15)).toBe("queue"); // 100% but < 20 runs
	expect(tierOf(20, 19)).toBe("auto"); // 95%
	expect(tierOf(20, 18)).toBe("queue"); // 90% -> not auto, not watch
});

test("10 runs at exactly 90% is queue, not watch", () => {
	expect(tierOf(10, 9)).toBe("queue");
});

test("parse and serialize round-trip", () => {
	const rows = parseRows("fix-lint\t20\t19\nbump-deps\t5\t5");
	expect(rows.get("fix-lint")).toEqual({ skill: "fix-lint", runs: 20, pass: 19 });
	expect(serializeRows(rows)).toBe("bump-deps\t5\t5\nfix-lint\t20\t19"); // sorted
});

test("applyLog accumulates", () => {
	const rows = new Map<string, Row>();
	applyLog(rows, "s", "pass");
	applyLog(rows, "s", "fail");
	applyLog(rows, "s", "pass");
	expect(rows.get("s")).toEqual({ skill: "s", runs: 3, pass: 2 });
});

test("applyLog flags a demotion crossing into watch", () => {
	// Build a skill at 10 runs / 10 pass (queue... actually 100% <20 = queue), then fail down.
	const rows = new Map<string, Row>();
	for (let i = 0; i < 10; i++) applyLog(rows, "s", "pass"); // 10/10 -> queue
	// now drive fails until it crosses below 90%: 10p/11r=90.9% queue; 10/12=83% -> watch
	applyLog(rows, "s", "fail"); // 10/11 -> queue
	const { demoted } = applyLog(rows, "s", "fail"); // 10/12 -> watch
	expect(demoted).toBe(true);
});

test("no demotion flag under 10 runs", () => {
	const rows = new Map<string, Row>();
	const { demoted } = applyLog(rows, "s", "fail"); // 0/1, watch but only 1 run
	expect(demoted).toBe(false);
});

test("two synchronized trust CLIs through symlinked shared memory preserve distinct updates", async () => {
	const fixture = makeConcurrentFixture("distinct concurrent updates", largeFixtureRows());
	const [first, second] = await runConcurrentUpdates(
		fixture,
		{ skill: "concurrent-alpha", result: "pass" },
		{ skill: "concurrent-beta", result: "fail" },
	);
	expect(first, first.stderr).toMatchObject({ status: 0 });
	expect(second, second.stderr).toMatchObject({ status: 0 });
	const rows = parseRows(readFileSync(fixture.ledger, "utf8"));
	retainTranscript(
		"concurrent-trust-ledger",
		`concurrent-alpha=${JSON.stringify(rows.get("concurrent-alpha") ?? null)}\n` +
			`concurrent-beta=${JSON.stringify(rows.get("concurrent-beta") ?? null)}\n`,
		fixture.root,
	);
	expect(rows.get("concurrent-alpha")).toEqual({ skill: "concurrent-alpha", runs: 1, pass: 1 });
	expect(rows.get("concurrent-beta")).toEqual({ skill: "concurrent-beta", runs: 1, pass: 0 });
	expectNoLedgerArtifacts(fixture);
}, 30_000);

test("two synchronized updates to one skill preserve both run and pass totals", async () => {
	const fixture = makeConcurrentFixture(
		"same skill concurrent updates",
		largeFixtureRows() + "shared-skill\t7\t6\n",
	);
	const [first, second] = await runConcurrentUpdates(
		fixture,
		{ skill: "shared-skill", result: "pass" },
		{ skill: "shared-skill", result: "fail" },
	);
	expect(first, first.stderr).toMatchObject({ status: 0 });
	expect(second, second.stderr).toMatchObject({ status: 0 });
	expect(parseRows(readFileSync(fixture.ledger, "utf8")).get("shared-skill")).toEqual({
		skill: "shared-skill",
		runs: 9,
		pass: 7,
	});
	expectNoLedgerArtifacts(fixture);
}, 30_000);

test("a failed atomic trust replacement releases its lock and preserves the target", () => {
	const root = makeRoot("failed replacement release");
	const memory = join(root, "memory");
	const ledger = join(memory, "trust.tsv");
	const external = join(root, "external trust.tsv");
	mkdirSync(memory);
	writeFileSync(external, "preserved\t4\t4\n", "utf8");
	symlinkSync(external, ledger);

	const failed = runSyncRetained(
		"failed-symlink-replacement",
		process.execPath,
		[trustTool, "log", "must-not-land", "pass"],
		{ env: { ...process.env, TRUST_FILE: ledger }, timeout: 10_000 },
		root,
	);
	expect(failed.error).toBeUndefined();
	expect(failed.status).not.toBe(0);
	expect(failed.stderr).toContain("atomic-write target is not a regular file");
	expect(readFileSync(external, "utf8")).toBe("preserved\t4\t4\n");
	expect(readdirSync(memory)).toEqual(["trust.tsv"]);

	unlinkSync(ledger);
	writeFileSync(ledger, "preserved\t4\t4\n", "utf8");
	const recovered = runSyncRetained(
		"replacement-after-failure",
		process.execPath,
		[trustTool, "log", "recovered", "pass"],
		{ env: { ...process.env, TRUST_FILE: ledger }, timeout: 10_000 },
		root,
	);
	expect(recovered.error).toBeUndefined();
	expect(recovered, recovered.stderr).toMatchObject({ status: 0 });
	expect(parseRows(readFileSync(ledger, "utf8")).get("recovered")).toEqual({
		skill: "recovered",
		runs: 1,
		pass: 1,
	});
	expect(readdirSync(memory)).toEqual(["trust.tsv"]);
});

test("project installer ships a runnable trust CLI with its ledger utility", () => {
	const root = makeRoot("installed project smoke");
	const target = join(root, "installed project");
	mkdirSync(target);
	const install = runSyncRetained(
		"trust-project-install",
		"bash",
		[join(repoRoot, "install.sh"), "--here", target],
		{
			env: {
				...process.env,
				HOME: join(root, "home"),
				PI_CODING_AGENT_DIR: join(root, "agent dir"),
			},
			timeout: 60_000,
		},
		root,
	);
	expect(install.error).toBeUndefined();
	expect(install, `${install.stdout}${install.stderr}`).toMatchObject({ status: 0 });
	expect(existsSync(join(target, "tools", "lib", "ledger-lock.ts"))).toBe(true);

	const ledger = join(target, "memory with spaces", "trust.tsv");
	const log = runSyncRetained(
		"installed-trust-log",
		process.execPath,
		[join(target, "tools", "trust.ts"), "log", "installed-smoke", "pass"],
		{ cwd: target, env: { ...process.env, TRUST_FILE: ledger }, timeout: 10_000 },
		target,
	);
	expect(log.error).toBeUndefined();
	expect(log, log.stderr).toMatchObject({ status: 0 });
	expect(log.stdout).toContain("installed-smoke: 1/1 -> watch");
	expect(parseRows(readFileSync(ledger, "utf8")).get("installed-smoke")).toEqual({
		skill: "installed-smoke",
		runs: 1,
		pass: 1,
	});
});
