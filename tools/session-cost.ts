/*
 * session-cost.ts — roll up accepted main-agent and persisted subagent usage from a pi session.
 *
 * Runs via bun; not a pi extension.
 *
 * usage:
 *   bun tools/session-cost.ts <session.jsonl> [--html]
 */

import { readFileSync } from "node:fs";

export type Cost = { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
export type ModelRow = { model: string; calls: number; tokensIn: number; tokensOut: number; cost: Cost };
export type CoverageReasonCode =
	| "malformed-main"
	| "duplicate-native-call"
	| "idless-native-call"
	| "malformed-native-container"
	| "malformed-native-child"
	| "malformed-legacy-annotation"
	| "no-usable-subagent-cost"
	| "legacy-fallback"
	| "ignored-legacy-annotation"
	| "aggregate-overflow";
export type CoverageReason = { code: CoverageReasonCode; count: number };
export type Rollup = {
	byModel: ModelRow[];
	grand: Cost;
	persistedSubagentCost: Cost | null;
	rawNativeCandidates: number;
	subagentCalls: number;
	duplicateNativeCalls: number;
	acceptedNativeChildren: number;
	coverage: "complete" | "incomplete";
	reasons: CoverageReason[];
};

type NormalizedMain = { kind: "main"; model: string; tokensIn: number; tokensOut: number; cost: Cost };
type NormalizedNative = {
	kind: "native";
	callIndex: number;
	model: string;
	tokensIn: number;
	tokensOut: number;
	cost: number;
};
type NormalizedLegacy = { kind: "legacy"; cost: Cost };
type Event = NormalizedMain | NormalizedNative | NormalizedLegacy;
type Accumulators = {
	models: Map<string, ModelRow>;
	grand: Cost;
	main: Cost;
	persisted: Cost;
	acceptedNativeChildren: number;
	acceptedNativeByCall: number[];
	acceptedLegacy: number;
	overflowMain: number;
	overflowNative: number;
	overflowLegacy: number;
};
type DiagnosticCounts = Record<CoverageReasonCode, number>;

const REASON_ORDER: readonly CoverageReasonCode[] = [
	"malformed-main",
	"duplicate-native-call",
	"idless-native-call",
	"malformed-native-container",
	"malformed-native-child",
	"malformed-legacy-annotation",
	"no-usable-subagent-cost",
	"legacy-fallback",
	"ignored-legacy-annotation",
	"aggregate-overflow",
];
const COST_FIELDS: readonly (keyof Cost)[] = ["input", "output", "cacheRead", "cacheWrite", "total"];
const OPTIONAL_TOKEN_FIELDS = ["input", "output", "cacheRead", "cacheWrite"] as const;

function emptyCost(): Cost {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
}

function emptyDiagnostics(): DiagnosticCounts {
	return {
		"malformed-main": 0,
		"duplicate-native-call": 0,
		"idless-native-call": 0,
		"malformed-native-container": 0,
		"malformed-native-child": 0,
		"malformed-legacy-annotation": 0,
		"no-usable-subagent-cost": 0,
		"legacy-fallback": 0,
		"ignored-legacy-annotation": 0,
		"aggregate-overflow": 0,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | null {
	if (!(key in record)) return 0;
	return isValidNumber(record[key]) ? record[key] : null;
}

function normalizeCost(value: unknown): Cost | null {
	if (!isRecord(value) || !isValidNumber(value.total)) return null;
	const input = optionalNumber(value, "input");
	const output = optionalNumber(value, "output");
	const cacheRead = optionalNumber(value, "cacheRead");
	const cacheWrite = optionalNumber(value, "cacheWrite");
	if (input === null || output === null || cacheRead === null || cacheWrite === null) return null;
	return { input, output, cacheRead, cacheWrite, total: value.total };
}

function normalizeTokens(usage: Record<string, unknown>): { input: number; output: number } | null {
	for (const field of OPTIONAL_TOKEN_FIELDS) {
		if (optionalNumber(usage, field) === null) return null;
	}
	return { input: optionalNumber(usage, "input") ?? 0, output: optionalNumber(usage, "output") ?? 0 };
}

function modelKey(value: unknown, fallback: "main/unknown" | "subagent/unknown"): string {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed === "" ? fallback : trimmed;
}

function normalizeMain(message: Record<string, unknown>): NormalizedMain | null {
	if (!isRecord(message.usage)) return null;
	const cost = normalizeCost(message.usage.cost);
	const tokens = normalizeTokens(message.usage);
	if (cost === null || tokens === null) return null;
	return {
		kind: "main",
		model: modelKey(message.model, "main/unknown"),
		tokensIn: tokens.input,
		tokensOut: tokens.output,
		cost,
	};
}

function normalizeNativeChild(value: unknown, callIndex: number): NormalizedNative | null {
	if (!isRecord(value) || !isRecord(value.usage) || !isValidNumber(value.usage.cost)) return null;
	const tokens = normalizeTokens(value.usage);
	if (tokens === null) return null;
	return {
		kind: "native",
		callIndex,
		model: modelKey(value.model, "subagent/unknown"),
		tokensIn: tokens.input,
		tokensOut: tokens.output,
		cost: value.usage.cost,
	};
}

function checkedSum(current: number, addition: number): number | null {
	const result = current + addition;
	return Number.isFinite(result) ? result : null;
}

function checkedCost(current: Cost, addition: Cost): Cost | null {
	const result = emptyCost();
	for (const field of COST_FIELDS) {
		const sum = checkedSum(current[field], addition[field]);
		if (sum === null) return null;
		result[field] = sum;
	}
	return result;
}

function newAccumulators(processedCalls: number): Accumulators {
	return {
		models: new Map(),
		grand: emptyCost(),
		main: emptyCost(),
		persisted: emptyCost(),
		acceptedNativeChildren: 0,
		acceptedNativeByCall: Array.from({ length: processedCalls }, () => 0),
		acceptedLegacy: 0,
		overflowMain: 0,
		overflowNative: 0,
		overflowLegacy: 0,
	};
}

function currentRow(state: Accumulators, model: string): ModelRow {
	return state.models.get(model) ?? { model, calls: 0, tokensIn: 0, tokensOut: 0, cost: emptyCost() };
}

function applyMain(state: Accumulators, event: NormalizedMain): void {
	const row = currentRow(state, event.model);
	const calls = checkedSum(row.calls, 1);
	const tokensIn = checkedSum(row.tokensIn, event.tokensIn);
	const tokensOut = checkedSum(row.tokensOut, event.tokensOut);
	const rowCost = checkedCost(row.cost, event.cost);
	const main = checkedCost(state.main, event.cost);
	const grand = checkedCost(state.grand, event.cost);
	if (calls === null || tokensIn === null || tokensOut === null || rowCost === null || main === null || grand === null) {
		state.overflowMain++;
		return;
	}
	state.models.set(event.model, { model: event.model, calls, tokensIn, tokensOut, cost: rowCost });
	state.main = main;
	state.grand = grand;
}

function applyNative(state: Accumulators, event: NormalizedNative): void {
	const row = currentRow(state, event.model);
	const calls = checkedSum(row.calls, 1);
	const tokensIn = checkedSum(row.tokensIn, event.tokensIn);
	const tokensOut = checkedSum(row.tokensOut, event.tokensOut);
	const scalarCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: event.cost };
	const rowCost = checkedCost(row.cost, scalarCost);
	const persisted = checkedCost(state.persisted, scalarCost);
	const grand = checkedCost(state.grand, scalarCost);
	if (calls === null || tokensIn === null || tokensOut === null || rowCost === null || persisted === null || grand === null) {
		state.overflowNative++;
		return;
	}
	state.models.set(event.model, { model: event.model, calls, tokensIn, tokensOut, cost: rowCost });
	state.persisted = persisted;
	state.grand = grand;
	state.acceptedNativeChildren++;
	state.acceptedNativeByCall[event.callIndex]++;
}

function applyLegacy(state: Accumulators, event: NormalizedLegacy): void {
	const model = "subagent/unknown";
	const row = currentRow(state, model);
	const rowCost = checkedCost(row.cost, event.cost);
	const persisted = checkedCost(state.persisted, event.cost);
	const grand = checkedCost(state.grand, event.cost);
	if (rowCost === null || persisted === null || grand === null) {
		state.overflowLegacy++;
		return;
	}
	state.models.set(model, { ...row, cost: rowCost });
	state.persisted = persisted;
	state.grand = grand;
	state.acceptedLegacy++;
}

function replay(events: Event[], processedCalls: number, source: "native" | "legacy"): Accumulators {
	const state = newAccumulators(processedCalls);
	for (const event of events) {
		if (event.kind === "main") applyMain(state, event);
		else if (event.kind === source) {
			if (event.kind === "native") applyNative(state, event);
			else applyLegacy(state, event);
		}
	}
	return state;
}

export function rollup(lines: string[]): Rollup {
	const events: Event[] = [];
	const diagnostics = emptyDiagnostics();
	const seenNativeIds = new Set<string>();
	let rawNativeCandidates = 0;
	let subagentCalls = 0;
	let duplicateNativeCalls = 0;
	let validLegacyAnnotations = 0;

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine === "") continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmedLine) as unknown;
		} catch {
			continue; // A partial/streaming line cannot be classified safely.
		}
		if (!isRecord(parsed)) continue;

		const message = isRecord(parsed.message) ? parsed.message : null;
		if (parsed.type === "message" && message?.role === "assistant") {
			const main = normalizeMain(message);
			if (main === null) diagnostics["malformed-main"]++;
			else events.push(main);
		}

		if (
			parsed.type === "message" &&
			message?.role === "toolResult" &&
			message.toolName === "subagent"
		) {
			rawNativeCandidates++;
			const persistedId = typeof parsed.id === "string" ? parsed.id.trim() : "";
			if (persistedId !== "" && seenNativeIds.has(persistedId)) {
				duplicateNativeCalls++;
				diagnostics["duplicate-native-call"]++;
			} else {
				if (persistedId === "") diagnostics["idless-native-call"]++;
				else seenNativeIds.add(persistedId);
				const callIndex = subagentCalls++;
				const details = isRecord(message.details) ? message.details : null;
				const results = details?.results;
				if (!Array.isArray(results) || results.length === 0) {
					diagnostics["malformed-native-container"]++;
				} else {
					for (const child of results) {
						const native = normalizeNativeChild(child, callIndex);
						if (native === null) diagnostics["malformed-native-child"]++;
						else events.push(native);
					}
				}
			}
		}

		if (Object.hasOwn(parsed, "subagentCost")) {
			const cost = normalizeCost(parsed.subagentCost);
			if (cost === null) diagnostics["malformed-legacy-annotation"]++;
			else {
				validLegacyAnnotations++;
				events.push({ kind: "legacy", cost });
			}
		}
	}

	const nativeState = replay(events, subagentCalls, "native");
	let selected: Accumulators;
	if (nativeState.acceptedNativeChildren > 0) {
		selected = nativeState;
		diagnostics["ignored-legacy-annotation"] = validLegacyAnnotations;
		diagnostics["aggregate-overflow"] = nativeState.overflowMain + nativeState.overflowNative;
	} else {
		const legacyState = replay(events, subagentCalls, "legacy");
		selected = legacyState;
		diagnostics["legacy-fallback"] = legacyState.acceptedLegacy;
		diagnostics["aggregate-overflow"] =
			nativeState.overflowNative + legacyState.overflowMain + legacyState.overflowLegacy;
	}

	if (selected.acceptedLegacy === 0) {
		diagnostics["no-usable-subagent-cost"] = selected.acceptedNativeByCall.filter((count) => count === 0).length;
	}

	const reasons = REASON_ORDER.flatMap((code): CoverageReason[] => {
		const count = diagnostics[code];
		return count > 0 ? [{ code, count }] : [];
	});
	const byModel = [...selected.models.values()].sort(
		(a, b) => b.cost.total - a.cost.total || a.model.localeCompare(b.model),
	);
	const hasSelectedSubagentCost = selected.acceptedNativeChildren > 0 || selected.acceptedLegacy > 0;
	return {
		byModel,
		grand: selected.grand,
		persistedSubagentCost: hasSelectedSubagentCost ? selected.persisted : null,
		rawNativeCandidates,
		subagentCalls,
		duplicateNativeCalls,
		acceptedNativeChildren: selected.acceptedNativeChildren,
		coverage: reasons.length === 0 ? "complete" : "incomplete",
		reasons,
	};
}

const usd = (n: number): string => `$${n.toFixed(4)}`;
const reasonText = (reason: CoverageReason): string => `${reason.code}: ${reason.count}`;

export function renderText(r: Rollup): string {
	const out: string[] = ["Session cost rollup (accepted persisted usage)", ""];
	out.push(["model".padEnd(22), "calls".padStart(6), "     tok in    tok out       cost"].join(""));
	for (const model of r.byModel) {
		out.push(
			model.model.padEnd(22) +
				String(model.calls).padStart(6) +
				String(model.tokensIn).padStart(11) +
				String(model.tokensOut).padStart(11) +
				usd(model.cost.total).padStart(11),
		);
	}
	out.push("".padEnd(22) + "".padStart(6) + "".padStart(11) + "ACCEPTED".padStart(11) + usd(r.grand.total).padStart(11));
	out.push("");
	out.push(`persisted subagent subtotal: ${usd(r.persistedSubagentCost?.total ?? 0)}`);
	out.push(
		`native candidates: ${r.rawNativeCandidates} raw, ${r.subagentCalls} processed, ${r.duplicateNativeCalls} duplicate; accepted children: ${r.acceptedNativeChildren}`,
	);
	out.push(`coverage: ${r.coverage}`);
	for (const reason of r.reasons) out.push(reasonText(reason));
	if (r.coverage === "incomplete") out.push("The accepted total is partial; rejected or ambiguous persisted cost is not treated as zero.");
	return out.join("\n");
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function renderHtml(r: Rollup, sessionName: string): string {
	const rows = r.byModel
		.map(
			(model) =>
				"<tr><td><code>" +
				escapeHtml(model.model) +
				"</code></td><td>" +
				model.calls +
				"</td><td>" +
				model.tokensIn +
				"</td><td>" +
				model.tokensOut +
				"</td><td>" +
				usd(model.cost.total) +
				"</td></tr>",
		)
		.join("");
	const reasons = r.reasons.map((reason) => `<li>${escapeHtml(reasonText(reason))}</li>`).join("");
	const partial =
		r.coverage === "incomplete"
			? "<p><small>The accepted total is partial; rejected or ambiguous persisted cost is not treated as zero.</small></p>"
			: "";
	return (
		'<div style="font-family:system-ui;max-width:640px">' +
		"<h3>Session cost — " +
		escapeHtml(sessionName) +
		'</h3><table border="1" cellpadding="6" style="border-collapse:collapse">' +
		"<tr><th>model</th><th>calls</th><th>tok in</th><th>tok out</th><th>cost</th></tr>" +
		rows +
		'<tr><td colspan="4" align="right"><b>ACCEPTED</b></td><td><b>' +
		usd(r.grand.total) +
		"</b></td></tr></table><p><small>Persisted subagent subtotal: " +
		usd(r.persistedSubagentCost?.total ?? 0) +
		". Native candidates: " +
		r.rawNativeCandidates +
		" raw, " +
		r.subagentCalls +
		" processed, " +
		r.duplicateNativeCalls +
		" duplicate; accepted children: " +
		r.acceptedNativeChildren +
		".</small></p><p>coverage: " +
		escapeHtml(r.coverage) +
		"</p>" +
		(reasons === "" ? "" : `<ul>${reasons}</ul>`) +
		partial +
		"</div>"
	);
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const html = args.includes("--html");
	const file = args.find((argument) => !argument.startsWith("--"));
	if (!file) {
		process.stderr.write("usage: session-cost.ts <session.jsonl> [--html]\n");
		process.exit(2);
	}
	try {
		const lines = readFileSync(file, "utf8").split("\n");
		const result = rollup(lines);
		const name = file.split("/").pop() ?? file;
		process.stdout.write(`${html ? renderHtml(result, name) : renderText(result)}\n`);
	} catch (error: unknown) {
		const detail = error instanceof Error ? error.message : String(error);
		process.stderr.write(`session-cost: unable to read ${file}: ${detail}\n`);
		process.exit(1);
	}
}
