/*
 * trust.ts — the per-skill autonomy trust ledger.
 *
 * Autonomy is earned per skill (recurring change/task type), not per loop. Every completed
 * task logs a pass/fail; the tally decides a tier:
 *   - auto  : >= 20 runs AND >= 95% pass — trusted to ship its drafts unattended
 *   - watch  : < 10 runs OR  < 90% pass — draft-only, closely reviewed
 *   - queue : everything in between — verified drafts wait for a human
 * Demotion is automatic: a fail that drops an established skill below 90% surfaces loudly.
 *
 * This is the measured version of the harness's risk-tiering — it turns "turn up autonomy
 * as trust grows" into a mechanism backed by the reviewer verdicts you already record.
 *
 * Runs via bun; not a pi extension, so normal TS is fine.
 *
 * usage:
 *   bun tools/trust.ts log <skill> <pass|fail>
 *   bun tools/trust.ts render
 *   bun tools/trust.ts tier <skill>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_FILE = "memory/trust.tsv";

export type Row = { skill: string; runs: number; pass: number };
export type Tier = "auto" | "queue" | "watch";

export function tierOf(runs: number, pass: number): Tier {
	const rate = runs > 0 ? pass / runs : 0;
	if (runs >= 20 && rate >= 0.95) return "auto";
	if (runs < 10 || rate < 0.9) return "watch";
	return "queue";
}

export function parseRows(text: string): Map<string, Row> {
	const rows = new Map<string, Row>();
	for (const line of text.split("\n")) {
		if (line.trim() === "") continue;
		const [skill, runs, pass] = line.split("\t");
		if (!skill) continue;
		rows.set(skill, { skill, runs: Number(runs) || 0, pass: Number(pass) || 0 });
	}
	return rows;
}

export function serializeRows(rows: Map<string, Row>): string {
	return [...rows.values()]
		.sort((a, b) => (a.skill < b.skill ? -1 : 1))
		.map((r) => r.skill + "\t" + r.runs + "\t" + r.pass)
		.join("\n");
}

/** Apply one result; returns the updated row and whether it just crossed DOWN into watch. */
export function applyLog(
	rows: Map<string, Row>,
	skill: string,
	result: "pass" | "fail",
): { row: Row; demoted: boolean } {
	const prev = rows.get(skill) ?? { skill, runs: 0, pass: 0 };
	const before = tierOf(prev.runs, prev.pass);
	const row: Row = {
		skill,
		runs: prev.runs + 1,
		pass: prev.pass + (result === "pass" ? 1 : 0),
	};
	rows.set(skill, row);
	const after = tierOf(row.runs, row.pass);
	const demoted = after === "watch" && before !== "watch" && row.runs >= 10;
	return { row, demoted };
}

function load(file: string): Map<string, Row> {
	if (!existsSync(file)) return new Map();
	return parseRows(readFileSync(file, "utf8"));
}

function save(file: string, rows: Map<string, Row>): void {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, serializeRows(rows) + "\n");
}

export function render(rows: Map<string, Row>): string {
	const head = ["skill".padEnd(24) + "runs".padStart(6) + "pass".padStart(6) + "  rate  tier"];
	const body = [...rows.values()]
		.sort((a, b) => (a.skill < b.skill ? -1 : 1))
		.map((r) => {
			const rate = r.runs > 0 ? Math.round((r.pass / r.runs) * 100) : 0;
			return (
				r.skill.padEnd(24) +
				String(r.runs).padStart(6) +
				String(r.pass).padStart(6) +
				(String(rate) + "%").padStart(7) +
				"  " +
				tierOf(r.runs, r.pass)
			);
		});
	return [...head, ...(body.length ? body : ["(no skills logged yet)"])].join("\n");
}

if (import.meta.main) {
	const [cmd, a, b] = process.argv.slice(2);
	const file = process.env.TRUST_FILE ?? DEFAULT_FILE;
	if (cmd === "log") {
		if (!a || (b !== "pass" && b !== "fail")) {
			process.stderr.write("usage: trust.ts log <skill> <pass|fail>\n");
			process.exit(2);
		}
		const rows = load(file);
		const { row, demoted } = applyLog(rows, a, b);
		save(file, rows);
		process.stdout.write(a + ": " + row.pass + "/" + row.runs + " -> " + tierOf(row.runs, row.pass) + "\n");
		if (demoted) process.stderr.write("ALERT: " + a + " demoted to watch after " + row.runs + " runs\n");
	} else if (cmd === "render") {
		process.stdout.write(render(load(file)) + "\n");
	} else if (cmd === "tier") {
		const r = load(file).get(a) ?? { skill: a, runs: 0, pass: 0 };
		process.stdout.write(tierOf(r.runs, r.pass) + "\n");
	} else {
		process.stderr.write("usage: trust.ts log <skill> <pass|fail> | render | tier <skill>\n");
		process.exit(2);
	}
}
