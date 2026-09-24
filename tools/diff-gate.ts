/*
 * diff-gate.ts — two checks a linter cannot make, run against the real diff.
 *
 * Runs via bun; not a pi extension. Read-only: it only runs git read commands.
 *
 * 1. Skip ratchet. A diff that adds more test skip or focus markers to a file than it removes
 *    fails. A skipped test makes a red suite green without fixing anything, and a focused test
 *    silently drops every sibling. Markers inside string literals and on comment lines do not
 *    count, so this file and its tests do not trip the gate they implement.
 * 2. Falsely green. With --change <name>, a ticked task whose files: line declares at least one
 *    source path fails when none of its declared paths changed. A docs-only task is exempt:
 *    changing no source is the correct outcome for it.
 *
 * Ported idea: pi-rukas work-driver-skip-ratchet.ts and work-driver-falsily-green.ts
 * (Apache-2.0). No code copied.
 *
 * usage: bun tools/diff-gate.ts [--base <ref>] [--change <name>]
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SKIP_MARKERS = [
	".skip(",
	".only(",
	".todo(",
	"xit(",
	"xdescribe(",
	"xtest(",
	"#[ignore]",
	"@Disabled",
	"@pytest.mark.skip",
];

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

/** Remove the contents of single, double, and backtick quoted strings on one line. */
export function stripStrings(line: string): string {
	let out = "";
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i] ?? "";
		if (quote === null) {
			if (ch === '"' || ch === "'" || ch === "`") {
				quote = ch;
				out += ch;
			} else {
				out += ch;
			}
			continue;
		}
		if (ch === "\\") {
			i++;
			continue;
		}
		if (ch === quote) {
			quote = null;
			out += ch;
		}
	}
	return out;
}

function isCommentLine(code: string): boolean {
	const t = code.trimStart();
	if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return true;
	return t.startsWith("#") && !t.startsWith("#[");
}

/** Count skip or focus markers in one source line, ignoring strings and comment lines. */
export function countMarkers(line: string): number {
	if (isCommentLine(line)) return 0;
	const code = stripStrings(line);
	let count = 0;
	for (const marker of SKIP_MARKERS) {
		let from = 0;
		for (;;) {
			const at = code.indexOf(marker, from);
			if (at === -1) break;
			from = at + marker.length;
			// A bare-word marker (xit, xtest, xdescribe) must not be the tail of a longer
			// identifier: exit( is not xit(.
			const bareWord = IDENTIFIER_CHAR.test(marker[0] ?? "");
			const before = at > 0 ? (code[at - 1] ?? "") : "";
			if (bareWord && (IDENTIFIER_CHAR.test(before) || before === ".")) continue;
			count++;
		}
	}
	return count;
}

export type SkipFinding = { file: string; added: number; removed: number; lines: string[] };

/** Net skip or focus markers per file in a unified diff. Only files that gained markers. */
export function skipRatchet(unifiedDiff: string): SkipFinding[] {
	const perFile = new Map<string, SkipFinding>();
	let file: string | null = null;
	for (const raw of unifiedDiff.split(/\r?\n/)) {
		if (raw.startsWith("+++ ")) {
			const target = raw.slice(4);
			file = target === "/dev/null" ? null : target.replace(/^b\//, "");
			continue;
		}
		if (raw.startsWith("--- ") || raw.startsWith("diff --git ")) continue;
		if (file === null) continue;
		const added = raw.startsWith("+");
		const removed = raw.startsWith("-");
		if (!added && !removed) continue;
		const n = countMarkers(raw.slice(1));
		if (n === 0) continue;
		const entry = perFile.get(file) ?? { file, added: 0, removed: 0, lines: [] };
		if (added) {
			entry.added += n;
			entry.lines.push(raw.slice(1).trim());
		} else {
			entry.removed += n;
		}
		perFile.set(file, entry);
	}
	return [...perFile.values()].filter((f) => f.added > f.removed);
}

export type DeclaredTask = { id: string; checked: boolean; files: string[] };

/** Parse tasks.md into tasks with their backticked files: paths. */
export function declaredTasks(tasksMd: string): DeclaredTask[] {
	const tasks: DeclaredTask[] = [];
	let current: DeclaredTask | null = null;
	for (const line of tasksMd.split(/\r?\n/)) {
		const head = /^- \[([ xX])\] (\d+(?:\.\d+)*)\b/.exec(line);
		if (head) {
			current = { id: head[2] ?? "", checked: head[1] !== " ", files: [] };
			tasks.push(current);
			continue;
		}
		if (line.startsWith("#") || line.startsWith("- [")) {
			current = null;
			continue;
		}
		if (current === null) continue;
		const filesLine = /^\s*files:\s*(.*)$/.exec(line);
		if (!filesLine) continue;
		for (const token of (filesLine[1] ?? "").matchAll(/`([^`]+)`/g)) {
			const path = (token[1] ?? "").trim();
			if (path !== "" && !path.includes("<") && !path.includes(" ")) current.files.push(path);
		}
	}
	return tasks;
}

const SOURCE_EXTENSIONS = new Set([
	"ts", "tsx", "js", "jsx", "mjs", "cjs", "sh", "bash", "py", "go", "rs", "java", "kt", "rb",
	"swift", "c", "h", "cpp", "cs", "php", "sql",
]);

export function isSourcePath(path: string): boolean {
	const name = path.split("/").pop() ?? path;
	if (name === "justfile" || name.startsWith("justfile.") || name === "Makefile") return true;
	if (name === "Dockerfile") return true;
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return false;
	return SOURCE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function globToRegExp(glob: string): RegExp {
	let pattern = "";
	for (let i = 0; i < glob.length; i++) {
		const ch = glob[i] ?? "";
		if (ch === "*") {
			if (glob[i + 1] === "*") {
				pattern += ".*";
				i++;
			} else {
				pattern += "[^/]*";
			}
		} else {
			pattern += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
		}
	}
	return new RegExp(`^${pattern}$`);
}

export function declaredMatches(declared: string, changed: string): boolean {
	const d = declared.replace(/^\.\//, "");
	if (d.endsWith("/")) return changed.startsWith(d);
	if (d.includes("*")) return globToRegExp(d).test(changed);
	return changed === d || changed.startsWith(`${d}/`);
}

export type FalselyGreenFinding = { taskId: string; declared: string[] };

export function falselyGreen(tasksMd: string, changed: string[]): FalselyGreenFinding[] {
	const findings: FalselyGreenFinding[] = [];
	for (const task of declaredTasks(tasksMd)) {
		if (!task.checked || task.files.length === 0) continue;
		if (!task.files.some(isSourcePath)) continue;
		const touched = task.files.some((d) => changed.some((c) => declaredMatches(d, c)));
		if (!touched) findings.push({ taskId: task.id, declared: task.files });
	}
	return findings;
}

function git(args: string[]): { ok: boolean; out: string } {
	const run = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
	return { ok: run.exitCode === 0, out: run.stdout.toString() };
}

/**
 * Resolve the base to a commit SHA. The reviewer may run this gate, so a --base value must
 * never reach git as an option: "--base --output=x" would make git diff write a file.
 */
export function resolveBase(explicit: string | undefined, tool = "diff-gate"): string {
	if (explicit !== undefined) {
		if (explicit === "" || explicit.startsWith("-")) throw new Error(`${tool}: --base must be a git ref, got "${explicit}"`);
		const sha = git(["rev-parse", "--verify", "--quiet", "--end-of-options", `${explicit}^{commit}`]);
		if (!sha.ok || sha.out.trim() === "") throw new Error(`${tool}: --base ${explicit} is not a commit`);
		return sha.out.trim();
	}
	for (const candidate of ["origin/main", "main"]) {
		const mb = git(["merge-base", "HEAD", candidate]);
		if (mb.ok && mb.out.trim() !== "") return mb.out.trim();
	}
	throw new Error(`${tool}: no --base given and no merge-base with origin/main or main`);
}

/** A change name is one path segment, like record-verdict requires. */
function checkChangeName(change: string): string {
	if (change === "" || change === "." || change === ".." || change.includes("/") || change.includes("\\") || change.startsWith("-")) {
		throw new Error(`diff-gate: --change must be a single change-folder name, got "${change}"`);
	}
	return change;
}

/** The working tree diff against base, with untracked files rendered as all-added. */
function collectDiff(base: string): { diff: string; changed: string[] } {
	const tracked = git(["diff", "--no-color", "--no-ext-diff", "-U0", base]);
	if (!tracked.ok) throw new Error(`diff-gate: git diff ${base} failed`);
	const names = git(["diff", "--name-only", base]).out.split("\n").filter(Boolean);
	const untracked = git(["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean);
	let diff = tracked.out;
	for (const path of untracked) {
		if (!existsSync(path) || !lstatSync(path).isFile()) continue;
		const body = readFileSync(path, "utf8")
			.split(/\r?\n/)
			.map((l) => `+${l}`)
			.join("\n");
		diff += `\n+++ b/${path}\n${body}\n`;
	}
	return { diff, changed: [...new Set([...names, ...untracked])] };
}

function parseArgs(argv: string[]): { base?: string; change?: string } {
	const out: { base?: string; change?: string } = {};
	for (let i = 0; i < argv.length; i++) {
		const flag = argv[i];
		const value = argv[i + 1];
		if ((flag === "--base" || flag === "--change") && value !== undefined) {
			out[flag === "--base" ? "base" : "change"] = value;
			i++;
		} else {
			throw new Error(`diff-gate: unknown argument ${flag}. usage: diff-gate [--base <ref>] [--change <name>]`);
		}
	}
	return out;
}

if (import.meta.main) {
	try {
		const args = parseArgs(process.argv.slice(2));
		const base = resolveBase(args.base);
		const { diff, changed } = collectDiff(base);
		let failed = false;

		const skips = skipRatchet(diff);
		for (const f of skips) {
			failed = true;
			console.log(`diff-gate: FAIL skip ratchet -- ${f.file} gains ${f.added - f.removed} skip/focus marker(s):`);
			for (const line of f.lines) console.log(`  + ${line}`);
		}

		if (args.change !== undefined) {
			const tasksPath = join("openspec", "changes", checkChangeName(args.change), "tasks.md");
			if (!existsSync(tasksPath)) throw new Error(`diff-gate: no ${tasksPath}`);
			for (const f of falselyGreen(readFileSync(tasksPath, "utf8"), changed)) {
				failed = true;
				console.log(
					`diff-gate: FAIL falsely green -- task ${f.taskId} is ticked but none of its declared files changed: ${f.declared.join(", ")}`,
				);
			}
		}

		const scope = args.change === undefined ? "skip ratchet" : "skip ratchet + falsely green";
		console.log(`diff-gate: ${failed ? "FAIL" : "clean"} (${scope}, base ${args.base ?? "merge-base"} @ ${base.slice(0, 12)}, ${changed.length} changed file(s))`);
		process.exit(failed ? 1 : 0);
	} catch (error: unknown) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
