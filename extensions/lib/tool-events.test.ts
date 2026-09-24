import { afterEach, expect, test } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createSyntheticTestLogger, logBlocked } from "./tool-events.ts";

const originalCwd = process.cwd();
const originalMode = process.env.PI_TOOL_EVENT_MODE;
const originalTestPath = process.env.PI_TOOL_EVENT_TEST_PATH;
const roots: string[] = [];
const children = new Set<ChildProcessWithoutNullStreams>();
const toolEventsModule = fileURLToPath(new URL("./tool-events.ts", import.meta.url));
const evidenceDirectory = process.env.TOOL_EVENTS_EVIDENCE_DIR;
const concurrentRounds = 3;
const workerSource =
	[
		"import { existsSync, writeFileSync } from \"node:fs\";",
		"import { pathToFileURL } from \"node:url\";",
		"const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));",
		"const [modulePath, ready, start, agent, guard, target] = process.argv.slice(2);",
		"const loaded = await import(pathToFileURL(modulePath).href);",
		"if (typeof loaded.logBlocked !== \"function\") {",
		"  throw new Error(\"tool-events module did not export logBlocked\");",
		"}",
		"process.env.PI_SUBAGENT_STACK = JSON.stringify([agent]);",
		"writeFileSync(ready, \"ready\\n\", \"utf8\");",
		"const deadline = Date.now() + 10_000;",
		"while (!existsSync(start)) {",
		"  if (Date.now() >= deadline) throw new Error(\"worker timed out waiting for synchronized start\");",
		"  Atomics.wait(sleepBuffer, 0, 0, 5);",
		"}",
		"loaded.logBlocked(guard, \"bash\", \"synchronized blocked call\", target);",
		"process.stdout.write(JSON.stringify({ agent, guard, target, cwd: process.cwd() }) + \"\\n\");",
	].join("\n") + "\n";

type ProcessResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

type RuntimeRecord = {
	ts: string;
	eventKind: "runtime";
	agent: string;
	guard: string;
	tool: string;
	reason: string;
	target: string;
};

type WorkerReport = {
	agent: string;
	guard: string;
	target: string;
	cwd: string;
};

function restoreEnv(name: "PI_TOOL_EVENT_MODE" | "PI_TOOL_EVENT_TEST_PATH", value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

afterEach(() => {
	process.chdir(originalCwd);
	restoreEnv("PI_TOOL_EVENT_MODE", originalMode);
	restoreEnv("PI_TOOL_EVENT_TEST_PATH", originalTestPath);
	for (const child of children) {
		if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
	}
	children.clear();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function waitForPath(path: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!existsSync(path)) {
		if (Date.now() >= deadline) throw new Error("timed out after " + timeoutMs + "ms waiting for " + path);
		await Bun.sleep(5);
	}
}

function retainTranscript(label: string, transcript: string, localRoot: string): void {
	writeFileSync(join(localRoot, label + ".transcript.txt"), transcript, "utf8");
	if (evidenceDirectory !== undefined) {
		mkdirSync(evidenceDirectory, { recursive: true });
		writeFileSync(join(evidenceDirectory, label + ".transcript.txt"), transcript, "utf8");
	}
}

async function finish(
	child: ChildProcessWithoutNullStreams,
	label: string,
	localRoot: string,
	timeoutMs: number,
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
				reject(new Error(label + " exceeded " + timeoutMs + "ms"));
			}, timeoutMs);
		}),
	]);
	if (timer !== undefined) clearTimeout(timer);
	children.delete(child);
	retainTranscript(
		label,
		"status=" + String(status) + "\n--- stdout ---\n" + stdout + "--- stderr ---\n" + stderr,
		localRoot,
	);
	return { status, stdout, stderr };
}

function parseObjectWithStringFields(raw: string, label: string, fields: readonly string[]): Record<string, string> {
	const value: unknown = JSON.parse(raw);
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(label + " is not a JSON object");
	}
	const record = value as Record<string, unknown>;
	for (const field of fields) {
		if (typeof record[field] !== "string") throw new Error(label + " field " + field + " is not a string");
	}
	return record as Record<string, string>;
}

function parseRuntimeRecord(line: string): RuntimeRecord {
	const record = parseObjectWithStringFields(line, "tool event line", [
		"ts",
		"eventKind",
		"agent",
		"guard",
		"tool",
		"reason",
		"target",
	]);
	if (record.eventKind !== "runtime") throw new Error("unexpected eventKind: " + record.eventKind);
	return record as RuntimeRecord;
}

function parseWorkerReport(stdout: string): WorkerReport {
	return parseObjectWithStringFields(stdout, "worker stdout", ["agent", "guard", "target", "cwd"]) as WorkerReport;
}

test("runtime logging writes a tagged runtime event", () => {
	const root = mkdtempSync(join(tmpdir(), "tool-events-runtime-"));
	try {
		process.chdir(root);
		logBlocked("force-delegate", "bash", "blocked", "just deploy");
		const record = JSON.parse(readFileSync(join(root, "memory", "tool-events.jsonl"), "utf8"));
		expect(record).toMatchObject({
			eventKind: "runtime",
			guard: "force-delegate",
			tool: "bash",
			reason: "blocked",
			target: "just deploy",
		});
	} finally {
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
});

test("inherited synthetic environment cannot spoof or drop runtime logging", () => {
	const root = mkdtempSync(join(tmpdir(), "tool-events-inherited-env-"));
	try {
		process.chdir(root);
		const redirected = join(root, "spoofed.jsonl");
		process.env.PI_TOOL_EVENT_MODE = "synthetic-test";
		process.env.PI_TOOL_EVENT_TEST_PATH = redirected;
		logBlocked("architect-scope", "bash", "blocked runtime", "rm -rf src");
		const record = JSON.parse(readFileSync(join(root, "memory", "tool-events.jsonl"), "utf8"));
		expect(record.eventKind).toBe("runtime");
		expect(record.target).toBe("rm -rf src");
		expect(existsSync(redirected)).toBe(false);
	} finally {
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
});

test("explicit synthetic test logger is tagged and isolated from runtime", () => {
	const root = mkdtempSync(join(tmpdir(), "tool-events-synthetic-"));
	try {
		process.chdir(root);
		const isolated = join(root, "isolated", "events.jsonl");
		createSyntheticTestLogger(isolated)("architect-scope", "bash", "blocked test", "rm -rf src");
		const record = JSON.parse(readFileSync(isolated, "utf8"));
		expect(record.eventKind).toBe("synthetic-test");
		expect(existsSync(join(root, "memory", "tool-events.jsonl"))).toBe(false);
	} finally {
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
});

test("two synchronized runtime writers keep complete lock-free appends in shared memory", async () => {
	for (let round = 1; round <= concurrentRounds; round += 1) {
		const root = mkdtempSync(join(tmpdir(), "tool-events-concurrent-" + round + "-"));
		roots.push(root);
		const sharedMemory = join(root, "primary-memory");
		const worker = join(root, "tool-events-worker.ts");
		const start = join(root, "release-both");
		mkdirSync(sharedMemory);
		writeFileSync(worker, workerSource, "utf8");

		const fixtures = [
			{
				worktree: join(root, "worktree-alpha"),
				ready: join(root, "alpha-ready"),
				agent: "developer-alpha-" + round,
				guard: "guard-alpha-" + round,
				target: "target-alpha-" + round,
			},
			{
				worktree: join(root, "worktree-beta"),
				ready: join(root, "beta-ready"),
				agent: "developer-beta-" + round,
				guard: "guard-beta-" + round,
				target: "target-beta-" + round,
			},
		];
		for (const fixture of fixtures) {
			mkdirSync(fixture.worktree);
			symlinkSync(sharedMemory, join(fixture.worktree, "memory"));
			expect(lstatSync(join(fixture.worktree, "memory")).isSymbolicLink()).toBe(true);
			expect(realpathSync(join(fixture.worktree, "memory"))).toBe(realpathSync(sharedMemory));
		}

		const launched = fixtures.map((fixture) => {
			const child = spawn(
				process.execPath,
				[
					worker,
					toolEventsModule,
					fixture.ready,
					start,
					fixture.agent,
					fixture.guard,
					fixture.target,
				],
				{ cwd: fixture.worktree, stdio: ["pipe", "pipe", "pipe"] },
			);
			children.add(child);
			return {
				fixture,
				finished: finish(child, "round-" + round + "-" + fixture.agent, root, 10_000),
			};
		});
		await Promise.all(launched.map(({ fixture }) => waitForPath(fixture.ready, 5_000)));
		writeFileSync(start, "release round " + round + "\n", "utf8");
		const results = await Promise.all(launched.map(({ finished }) => finished));

		for (const [index, result] of results.entries()) {
			expect(result, result.stderr).toMatchObject({ status: 0, stderr: "" });
			expect(parseWorkerReport(result.stdout)).toEqual({
				agent: fixtures[index].agent,
				guard: fixtures[index].guard,
				target: fixtures[index].target,
				cwd: realpathSync(fixtures[index].worktree),
			});
		}
		const ledger = join(sharedMemory, "tool-events.jsonl");
		const rawLedger = readFileSync(ledger, "utf8");
		expect(rawLedger.endsWith("\n")).toBe(true);
		const lines = rawLedger.trimEnd().split("\n");
		expect(lines).toHaveLength(2);
		const records = lines.map(parseRuntimeRecord);
		expect(records.map(({ eventKind }) => eventKind)).toEqual(["runtime", "runtime"]);
		expect(records.map(({ agent }) => agent).sort()).toEqual(fixtures.map(({ agent }) => agent).sort());
		expect(records.map(({ guard }) => guard).sort()).toEqual(fixtures.map(({ guard }) => guard).sort());
		expect(records.map(({ target }) => target).sort()).toEqual(fixtures.map(({ target }) => target).sort());
		for (const record of records) {
			expect(record.tool).toBe("bash");
			expect(record.reason).toBe("synchronized blocked call");
			expect(Number.isNaN(Date.parse(record.ts))).toBe(false);
		}
		const sharedArtifacts = readdirSync(sharedMemory).sort();
		expect(sharedArtifacts).toEqual(["tool-events.jsonl"]);
		retainTranscript(
			"round-" + round + "-shared-state",
			"ledger=" + JSON.stringify(rawLedger) + "\nshared-artifacts=" + JSON.stringify(sharedArtifacts) + "\n",
			root,
		);
	}
}, 40_000);

test("tool-events source keeps runtime logging on plain append", () => {
	const source = readFileSync(toolEventsModule, "utf8");
	expect(source).toContain("import { appendFileSync, mkdirSync } from \"fs\";");
	expect(source).toContain("appendFileSync(path, JSON.stringify(rec) + \"\\n\");");
	expect(source).not.toContain("ledger-lock");
	expect(source).not.toContain("withLedgerLock");
	expect(source).not.toContain("atomicWrite");
	expect(source).not.toContain("renameSync");
});

test("logging failures remain fail-open", () => {
	const root = mkdtempSync(join(tmpdir(), "tool-events-fail-open-"));
	try {
		const directoryAsFile = join(root, "events.jsonl");
		mkdirSync(directoryAsFile);
		const logger = createSyntheticTestLogger(directoryAsFile);
		expect(() => logger("developer-guard", "bash", "blocked", "rm -rf src")).not.toThrow();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
