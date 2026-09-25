import { afterEach, test, expect } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePredicate, isRetired, verifyGoals } from "./verify-goals.ts";

const roots: string[] = [];
const children = new Set<ChildProcessWithoutNullStreams>();
const verifyGoalsTool = fileURLToPath(new URL("./verify-goals.ts", import.meta.url));
const evidenceDirectory = process.env.VERIFY_GOALS_EVIDENCE_DIR;

type ProcessResult = {
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

function shellQuote(value: string): string {
	return "'" + value.replaceAll("'", "'\\''") + "'";
}

function makePassingGoal(goalFile: string, predicateScript: string, ready: string, start: string): void {
	writeFileSync(
		predicateScript,
		"#!/usr/bin/env bash\n" +
			"set -eu\n" +
			`printf 'ready\\n' > ${shellQuote(ready)}\n` +
			"attempt=0\n" +
			`while [ ! -e ${shellQuote(start)} ]; do\n` +
			"  attempt=$((attempt + 1))\n" +
			"  if [ \"$attempt\" -ge 500 ]; then\n" +
			"    printf 'predicate timed out waiting for synchronized start\\n' >&2\n" +
			"    exit 70\n" +
			"  fi\n" +
			"  sleep 0.01\n" +
			"done\n",
		"utf8",
	);
	writeFileSync(
		goalFile,
		"status: VIOLATED\nlast-pass: 2000-01-01\npredicate: bash " + shellQuote(predicateScript) + "\n",
		"utf8",
	);
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

function launchVerifyGoals(worktree: string): ChildProcessWithoutNullStreams {
	const child = spawn(
		process.execPath,
		[verifyGoalsTool, "--dir", "goals", "--ledger", join("memory", "goal-ledger.tsv")],
		{ cwd: worktree, stdio: ["pipe", "pipe", "pipe"] },
	);
	children.add(child);
	return child;
}

test("parsePredicate extracts the shell command", () => {
	expect(parsePredicate("status: satisfied\npredicate: test -f README.md\n")).toBe("test -f README.md");
	expect(parsePredicate("no predicate here")).toBeNull();
});

test("isRetired detects the retired status", () => {
	expect(isRetired("status: retired\n")).toBe(true);
	expect(isRetired("status: satisfied\n")).toBe(false);
});

test("verifyGoals passes a true predicate and violates a false one", () => {
	const dir = mkdtempSync(join(tmpdir(), "goals-"));
	const ledger = join(dir, "ledger.tsv");
	writeFileSync(join(dir, "ok.md"), "status: satisfied\nlast-pass: 2000-01-01\npredicate: true\n");
	writeFileSync(join(dir, "bad.md"), "status: satisfied\npredicate: false\n");

	const { results, violations } = verifyGoals({ dir, ledger, today: "2026-07-09" });

	expect(results.length).toBe(2);
	expect(violations).toEqual(["bad"]);
	// file statuses flipped correctly
	expect(readFileSync(join(dir, "bad.md"), "utf8")).toContain("status: VIOLATED");
	expect(readFileSync(join(dir, "ok.md"), "utf8")).toContain("status: satisfied");
	expect(readFileSync(join(dir, "ok.md"), "utf8")).toContain("last-pass: 2026-07-09");
	// ledger has both rows
	const rows = readFileSync(ledger, "utf8").trim().split("\n");
	expect(rows.length).toBe(2);
	expect(rows.some((r) => r.includes("\tbad\tFAIL\t"))).toBe(true);
	expect(rows.some((r) => r.includes("\tok\tPASS\t"))).toBe(true);
});

test("verifyGoals skips retired goals and the template", () => {
	const dir = mkdtempSync(join(tmpdir(), "goals-"));
	writeFileSync(join(dir, "_TEMPLATE.md"), "predicate: false\n");
	writeFileSync(join(dir, "old.md"), "status: retired\npredicate: false\n");
	const { results, violations } = verifyGoals({ dir, ledger: join(dir, "l.tsv"), today: "2026-07-09" });
	expect(results.length).toBe(0);
	expect(violations).toEqual([]);
});

test("cold start: no goals dir returns clean empty", () => {
	const { results, violations } = verifyGoals({ dir: join(tmpdir(), "nope-xyz"), ledger: join(tmpdir(), "l.tsv") });
	expect(results).toEqual([]);
	expect(violations).toEqual([]);
});

test("two synchronized verify-goals processes keep lock-free shared-ledger rows intact", async () => {
	const root = mkdtempSync(join(tmpdir(), "verify-goals-concurrent-"));
	roots.push(root);
	const sharedMemory = join(root, "primary-memory");
	const start = join(root, "release-both");
	mkdirSync(sharedMemory);

	const worktrees = [
		{ directory: join(root, "worktree-alpha"), goal: "concurrent-alpha" },
		{ directory: join(root, "worktree-beta"), goal: "concurrent-beta" },
	];
	const readyPaths: string[] = [];
	for (const { directory, goal } of worktrees) {
		const goals = join(directory, "goals");
		const ready = join(root, `${goal}.ready`);
		const predicateScript = join(root, `${goal}-predicate.sh`);
		mkdirSync(goals, { recursive: true });
		symlinkSync(sharedMemory, join(directory, "memory"));
		makePassingGoal(join(goals, `${goal}.md`), predicateScript, ready, start);
		readyPaths.push(ready);
	}

	const firstChild = launchVerifyGoals(worktrees[0].directory);
	const secondChild = launchVerifyGoals(worktrees[1].directory);
	const firstFinished = finish(firstChild, "verify-goals-alpha", root, 10_000);
	const secondFinished = finish(secondChild, "verify-goals-beta", root, 10_000);
	await Promise.all(readyPaths.map((path) => waitForPath(path, 5_000)));
	writeFileSync(start, "release both verify-goals processes\n", "utf8");
	const [first, second] = await Promise.all([firstFinished, secondFinished]);

	expect(first, first.stderr).toMatchObject({ status: 0 });
	expect(second, second.stderr).toMatchObject({ status: 0 });
	const ledger = join(sharedMemory, "goal-ledger.tsv");
	const rows = readFileSync(ledger, "utf8").trimEnd().split("\n");
	expect(rows).toHaveLength(2);
	const parsedRows = rows.map((row) => row.split("\t"));
	for (const columns of parsedRows) {
		expect(columns).toHaveLength(4);
		expect(columns[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(columns[2]).toBe("PASS");
		expect(columns[3]).toMatch(/^\d+$/);
	}
	expect(parsedRows.map((columns) => columns[1]).sort()).toEqual(["concurrent-alpha", "concurrent-beta"]);

	const datesByGoal = new Map(parsedRows.map((columns) => [columns[1], columns[0]]));
	for (const { directory, goal } of worktrees) {
		const stamp = readFileSync(join(directory, "goals", `${goal}.md`), "utf8");
		expect(stamp).toContain("status: satisfied");
		expect(stamp).toContain(`last-pass: ${datesByGoal.get(goal)}`);
	}
	expect(readdirSync(sharedMemory)).toEqual(["goal-ledger.tsv"]);
	retainTranscript(
		"verify-goals-shared-state",
		`ledger=${JSON.stringify(rows)}\n` +
			`alpha-stamp=${JSON.stringify(readFileSync(join(worktrees[0].directory, "goals", "concurrent-alpha.md"), "utf8"))}\n` +
			`beta-stamp=${JSON.stringify(readFileSync(join(worktrees[1].directory, "goals", "concurrent-beta.md"), "utf8"))}\n` +
			`shared-artifacts=${JSON.stringify(readdirSync(sharedMemory))}\n`,
		root,
	);
}, 15_000);

test("verify-goals source keeps the goal ledger on the plain append path", () => {
	const source = readFileSync(verifyGoalsTool, "utf8");
	expect(source).toContain(
		'appendFileSync(ledger, today + "\\t" + goalName + "\\t" + (ok ? "PASS" : "FAIL") + "\\t" + ms + "\\n");',
	);
	expect(source).not.toContain("ledger-lock");
	expect(source).not.toContain("withLedgerLock");
	expect(source).not.toContain("atomicWrite");
});
