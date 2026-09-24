/*
 * learnings-inject -- inject scoped active learnings when a session starts.
 *
 * Changed-file scope is the sorted union of committed branch changes from the merge base
 * with a fixed main or master ref, HEAD working-tree changes, and untracked files. The
 * LEARNINGS_INJECT_BASE environment variable overrides the fixed ref search. A missing
 * base or failed git command is SCOPE UNKNOWN, never a healthy empty result. A successful
 * empty union is a known cold start and still runs the selector for its clean-empty text.
 * Selection, ordering, and the result cap stay owned by tools/select-learnings.ts.
 *
 * This extension only runs read-only child processes. It does not write through any agent
 * path and does not weaken the existing delegation or artifact ownership guards.
 *
 * Loader safety: use plain double quoted strings, no raw delimiter characters, and no
 * literal patterns. Keep every source line balanced for the pi extension tokenizer.
 */

import { spawnSync } from "node:child_process";

type RunResult =
	| { ok: true; stdout: string }
	| { ok: false; reason: string };

type ScopeResult =
	| { ok: true; root: string; paths: string[]; source: string }
	| { ok: false; reason: string };

const BASE_ENV = "LEARNINGS_INJECT_BASE";
const BASE_REFS = [
	"refs/remotes/origin/main",
	"refs/remotes/upstream/main",
	"refs/heads/main",
	"refs/remotes/origin/master",
	"refs/remotes/upstream/master",
	"refs/heads/master",
];

function oneLine(text: string): string {
	return text.split("\n").join(" ").split("\r").join(" ").trim().slice(0, 240);
}

function run(cwd: string, command: string, args: string[], input?: string): RunResult {
	const result = spawnSync(command, args, {
		cwd: cwd,
		encoding: "utf8",
		input: input,
		maxBuffer: 1024 * 1024,
		timeout: 10000,
	});
	if (result.error) {
		return { ok: false, reason: command + " failed: " + oneLine(result.error.message) };
	}
	if (result.status !== 0) {
		const detail = oneLine(String(result.stderr || ""));
		const suffix = detail === "" ? "" : ": " + detail;
		return { ok: false, reason: command + " exited " + String(result.status) + suffix };
	}
	return { ok: true, stdout: String(result.stdout || "") };
}

function resolveBase(root: string): RunResult {
	const configured = process.env[BASE_ENV];
	const refs = configured && configured.trim() !== "" ? [configured.trim()] : BASE_REFS;
	for (const ref of refs) {
		const commit = run(root, "git", ["rev-parse", "--verify", "--quiet", ref + "^{commit}"]);
		if (!commit.ok) {
			if (configured) return { ok: false, reason: BASE_ENV + " does not resolve: " + ref };
			continue;
		}
		const mergeBase = run(root, "git", ["merge-base", "HEAD", commit.stdout.trim()]);
		if (mergeBase.ok && mergeBase.stdout.trim() !== "") {
			return {
				ok: true,
				stdout: ref + " at merge-base " + mergeBase.stdout.trim(),
			};
		}
		if (configured) return { ok: false, reason: BASE_ENV + " has no merge base with HEAD" };
	}
	return {
		ok: false,
		reason: "no main or master comparison ref resolved; set " + BASE_ENV,
	};
}

function pathsFromNul(text: string): string[] {
	return text.split("\0").filter((path) => path !== "");
}

function deriveScope(cwd: string): ScopeResult {
	const rootResult = run(cwd, "git", ["rev-parse", "--show-toplevel"]);
	if (!rootResult.ok) return { ok: false, reason: rootResult.reason };
	const root = rootResult.stdout.trim();
	if (root === "") return { ok: false, reason: "git returned an empty repository root" };

	const baseResult = resolveBase(root);
	if (!baseResult.ok) return { ok: false, reason: baseResult.reason };
	const base = baseResult.stdout.slice(baseResult.stdout.lastIndexOf(" ") + 1);

	const branch = run(root, "git", [
		"diff", "--name-only", "--no-renames", "--no-ext-diff", "-z", base, "HEAD", "--",
	]);
	if (!branch.ok) return { ok: false, reason: "branch diff: " + branch.reason };
	const working = run(root, "git", [
		"diff", "--name-only", "--no-renames", "--no-ext-diff", "-z", "HEAD", "--",
	]);
	if (!working.ok) return { ok: false, reason: "working diff: " + working.reason };
	const untracked = run(root, "git", ["ls-files", "--others", "--exclude-standard", "-z"]);
	if (!untracked.ok) return { ok: false, reason: "untracked scan: " + untracked.reason };

	const all = [
		...pathsFromNul(branch.stdout),
		...pathsFromNul(working.stdout),
		...pathsFromNul(untracked.stdout),
	];
	for (const path of all) {
		if (path.indexOf("\n") !== -1 || path.indexOf("\r") !== -1) {
			return { ok: false, reason: "a changed path cannot be represented by selector stdin" };
		}
	}
	const paths = Array.from(new Set(all)).sort();
	return {
		ok: true,
		root: root,
		paths: paths,
		source: baseResult.stdout + " plus HEAD working tree plus untracked files",
	};
}

function framed(lines: string[]): string {
	return ["----- scoped-learnings -----", ...lines, "----- end scoped-learnings -----"].join("\n");
}

function scopeUnknown(reason: string): string {
	return framed([
		"status: SCOPE UNKNOWN",
		"Relevant learnings were not selected because changed-file scope could not be derived.",
		"reason: " + oneLine(reason),
	]);
}

function retrievalError(reason: string): string {
	return framed([
		"status: RETRIEVAL ERROR",
		"Relevant learnings were not selected because the selector did not complete.",
		"reason: " + oneLine(reason),
	]);
}

function buildInjection(cwd: string): string {
	const scope = deriveScope(cwd);
	if (!scope.ok) return scopeUnknown(scope.reason);
	const input = scope.paths.length === 0 ? "" : scope.paths.join("\n") + "\n";
	const selected = run(scope.root, "bun", ["tools/select-learnings.ts"], input);
	if (!selected.ok) return retrievalError(selected.reason);
	const output = selected.stdout.trim();
	if (output === "") return retrievalError("selector returned empty output");
	return framed([
		"status: " + (scope.paths.length === 0 ? "scope-derived-empty" : "scope-derived"),
		"source: " + scope.source,
		"changed files: " + String(scope.paths.length),
		"",
		output,
	]);
}

export default function (pi: any) {
	pi.on("session_start", async (_event: any, ctx: any) => {
		const cwd = ctx && typeof ctx.cwd === "string" ? ctx.cwd : process.cwd();
		const content = buildInjection(cwd);
		try {
			pi.sendMessage({
				customType: "learnings-inject",
				content: content,
				display: true,
			});
		} catch {
			process.stderr.write("\n" + content + "\n\n");
		}
	});
}
