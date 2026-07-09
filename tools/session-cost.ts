/*
 * session-cost.ts — roll up the cost of a pi session that `pi --export` does not total.
 *
 * pi records per-message cost at message.usage.cost {input,output,cacheRead,cacheWrite,total}
 * keyed by message.model, but the HTML export shows no grand total and (crucially) subagents
 * run with --no-session, so their spend is computed live in the TUI and NEVER written to the
 * parent session. This tool:
 *   - sums the MAIN agent cost per model + a grand total (accurate, from the file),
 *   - counts subagent tool calls and reports that their cost is NOT persisted (TUI-only) —
 *     surfacing the coverage gap instead of silently under-reporting,
 *   - is forward-compatible: if a record ever carries a `subagentCost` annotation, it is
 *     included (that is the hook a future persistence step would write).
 *   - with --html, emits a small self-contained cost summary to sit beside the export.
 *
 * Runs via bun; not a pi extension.
 *
 * usage:
 *   bun tools/session-cost.ts <session.jsonl> [--html]
 */

import { readFileSync } from "node:fs";

export type Cost = { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
export type ModelRow = { model: string; calls: number; tokensIn: number; tokensOut: number; cost: Cost };
export type Rollup = {
	byModel: ModelRow[];
	grand: Cost;
	subagentCalls: number;
	persistedSubagentCost: Cost | null;
};

function emptyCost(): Cost {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}
function addCost(a: Cost, b: Partial<Cost>): void {
	a.input += b.input ?? 0;
	a.output += b.output ?? 0;
	a.cacheRead += b.cacheRead ?? 0;
	a.cacheWrite += b.cacheWrite ?? 0;
	a.total += b.total ?? 0;
}

function isSubagentCall(content: unknown): boolean {
	if (!Array.isArray(content)) return false;
	for (const item of content) {
		if (item && typeof item === "object") {
			const it = item as Record<string, unknown>;
			if (it.name === "subagent" || it.toolName === "subagent") return true;
		}
	}
	return false;
}

export function rollup(lines: string[]): Rollup {
	const models = new Map<string, ModelRow>();
	const grand = emptyCost();
	let subagentCalls = 0;
	let persisted: Cost | null = null;

	for (const line of lines) {
		const t = line.trim();
		if (t === "") continue;
		let rec: any;
		try {
			rec = JSON.parse(t);
		} catch {
			continue; // tolerate a partial/streaming line
		}
		const msg = rec?.message;

		// Forward-compat: a persisted subagent-cost annotation, if a future hook writes one.
		if (rec?.subagentCost && typeof rec.subagentCost === "object") {
			persisted = persisted ?? emptyCost();
			addCost(persisted, rec.subagentCost);
		}

		if (!msg) continue;
		if (isSubagentCall(msg.content)) subagentCalls++;

		const cost = msg.usage?.cost;
		if (cost && typeof cost === "object") {
			const model = String(msg.model ?? "unknown");
			let row = models.get(model);
			if (!row) {
				row = { model, calls: 0, tokensIn: 0, tokensOut: 0, cost: emptyCost() };
				models.set(model, row);
			}
			row.calls++;
			row.tokensIn += Number(msg.usage?.input ?? 0);
			row.tokensOut += Number(msg.usage?.output ?? 0);
			addCost(row.cost, cost);
			addCost(grand, cost);
		}
	}

	const byModel = [...models.values()].sort((a, b) => b.cost.total - a.cost.total);
	return { byModel, grand, subagentCalls, persistedSubagentCost: persisted };
}

const usd = (n: number) => "$" + n.toFixed(4);

export function renderText(r: Rollup): string {
	const out: string[] = ["Session cost rollup (main agent)", ""];
	out.push("model".padEnd(22) + "calls".padStart(6) + "     tok in    tok out       cost");
	for (const m of r.byModel) {
		out.push(
			m.model.padEnd(22) +
				String(m.calls).padStart(6) +
				String(m.tokensIn).padStart(11) +
				String(m.tokensOut).padStart(11) +
				usd(m.cost.total).padStart(11),
		);
	}
	out.push("".padEnd(22) + "".padStart(6) + "".padStart(11) + "GRAND".padStart(11) + usd(r.grand.total).padStart(11));
	out.push("");
	if (r.persistedSubagentCost) {
		out.push("subagent cost (persisted): " + usd(r.persistedSubagentCost.total));
	} else if (r.subagentCalls > 0) {
		out.push(
			r.subagentCalls +
				" subagent call(s) found — their cost is NOT in this session (subagents run --no-session; " +
				"cost is TUI-only). The grand total above is MAIN-agent only. To roll subagent spend in, " +
				"persist it (fork-mode sessions, or a subagent-cost hook).",
		);
	} else {
		out.push("no subagent calls in this session.");
	}
	return out.join("\n");
}

export function renderHtml(r: Rollup, sessionName: string): string {
	const rows = r.byModel
		.map(
			(m) =>
				"<tr><td><code>" +
				m.model +
				"</code></td><td>" +
				m.calls +
				"</td><td>" +
				m.tokensIn +
				"</td><td>" +
				m.tokensOut +
				"</td><td>" +
				usd(m.cost.total) +
				"</td></tr>",
		)
		.join("");
	const note = r.persistedSubagentCost
		? "Includes persisted subagent cost " + usd(r.persistedSubagentCost.total) + "."
		: r.subagentCalls > 0
			? r.subagentCalls + " subagent call(s) — cost TUI-only, NOT included (main-agent total)."
			: "No subagent calls.";
	return (
		'<div style="font-family:system-ui;max-width:640px">' +
		"<h3>Session cost — " +
		sessionName +
		"</h3><table border=1 cellpadding=6 style=border-collapse:collapse>" +
		"<tr><th>model</th><th>calls</th><th>tok in</th><th>tok out</th><th>cost</th></tr>" +
		rows +
		"<tr><td colspan=4 align=right><b>GRAND</b></td><td><b>" +
		usd(r.grand.total) +
		"</b></td></tr></table><p><small>" +
		note +
		"</small></p></div>"
	);
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const html = args.includes("--html");
	const file = args.find((a) => !a.startsWith("--"));
	if (!file) {
		process.stderr.write("usage: session-cost.ts <session.jsonl> [--html]\n");
		process.exit(2);
	}
	const lines = readFileSync(file, "utf8").split("\n");
	const r = rollup(lines);
	const name = file.split("/").pop() ?? file;
	process.stdout.write((html ? renderHtml(r, name) : renderText(r)) + "\n");
}
