/*
 * verify-goals.ts — re-verify standing goals, forever.
 *
 * "A goal you only verify once is an assumption with a timestamp." A finished change drops a
 * goals/<name>.md whose `predicate:` line is a shell command: exit 0 means the invariant
 * still holds. This runs every predicate, flips satisfied<->VIOLATED in the file, appends a
 * row to the goal-ledger, and exits non-zero if anything regressed — so a silent regression
 * on something you were sure was done becomes loud.
 *
 * This generalises the check-learnings canary from "is retrieval live" to "is every finished
 * thing still true". Predicates are author-written (trusted) shell; keep them cheap, read-only.
 *
 * Runs via bun; not a pi extension.
 *
 * usage: bun tools/verify-goals.ts [--dir goals] [--ledger memory/goal-ledger.tsv]
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export type GoalResult = { name: string; ok: boolean; ms: number };

export function parsePredicate(text: string): string | null {
	for (const line of text.split("\n")) {
		const t = line.trim();
		if (t.startsWith("predicate:")) return t.slice("predicate:".length).trim();
	}
	return null;
}

export function isRetired(text: string): boolean {
	for (const line of text.split("\n")) {
		if (line.trim().replace(/\s+/g, " ").toLowerCase() === "status: retired") return true;
	}
	return false;
}

function stamp(text: string, status: string, today: string): string {
	let sawStatus = false;
	const out = text.split("\n").map((line) => {
		if (line.trim().startsWith("status:")) {
			sawStatus = true;
			return "status: " + status;
		}
		if (line.trim().startsWith("last-pass:") && status === "satisfied") {
			return "last-pass: " + today;
		}
		return line;
	});
	if (!sawStatus) out.unshift("status: " + status);
	return out.join("\n");
}

/** Run every non-retired goal in dir. Returns results; writes files + ledger as a side effect. */
export function verifyGoals(opts: {
	dir?: string;
	ledger?: string;
	today?: string;
	timeoutMs?: number;
}): { results: GoalResult[]; violations: string[] } {
	const dir = opts.dir ?? "goals";
	const ledger = opts.ledger ?? "memory/goal-ledger.tsv";
	const today = opts.today ?? "1970-01-01";
	const timeoutMs = opts.timeoutMs ?? 60000;
	const results: GoalResult[] = [];
	const violations: string[] = [];
	if (!existsSync(dir)) return { results, violations };

	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".md")) continue;
		if (name.startsWith("_") || name === "README.md") continue;
		const file = join(dir, name);
		const text = readFileSync(file, "utf8");
		if (isRetired(text)) continue;
		const pred = parsePredicate(text);
		const goalName = name.replace(/\.md$/, "");
		if (!pred) continue;

		const start = Date.now();
		const proc = Bun.spawnSync(["bash", "-c", pred], {
			stdout: "ignore",
			stderr: "ignore",
			timeout: timeoutMs,
		});
		const ms = Date.now() - start;
		const ok = proc.exitCode === 0;
		results.push({ name: goalName, ok, ms });
		if (!ok) violations.push(goalName);

		writeFileSync(file, stamp(text, ok ? "satisfied" : "VIOLATED", today));
		mkdirSync(dirname(ledger), { recursive: true });
		appendFileSync(ledger, today + "\t" + goalName + "\t" + (ok ? "PASS" : "FAIL") + "\t" + ms + "\n");
	}
	return { results, violations };
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
	let dir = "goals";
	let ledger = "memory/goal-ledger.tsv";
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--dir") dir = argv[++i];
		else if (argv[i] === "--ledger") ledger = argv[++i];
	}
	// Date.now-derived today is fine at the CLI boundary (only workflow scripts forbid it).
	const today = new Date().toISOString().slice(0, 10);
	const { results, violations } = verifyGoals({ dir, ledger, today });
	for (const r of results) process.stdout.write((r.ok ? "  ok   " : "  FAIL ") + r.name + " (" + r.ms + "ms)\n");
	if (violations.length > 0) {
		process.stderr.write("verify-goals: " + violations.length + " VIOLATED — " + violations.join(", ") + "\n");
		process.exit(1);
	}
	process.stdout.write("verify-goals: all " + results.length + " standing goal(s) hold\n");
}
