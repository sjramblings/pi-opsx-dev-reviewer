import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHtml, renderText, rollup, type Cost, type CoverageReasonCode } from "./session-cost.ts";

const fullCost = (total: number): Cost => ({
	input: total * 0.5,
	output: total * 0.3,
	cacheRead: total * 0.1,
	cacheWrite: total * 0.1,
	total,
});

function main(model: unknown, total: number, input = 100, output = 20): Record<string, unknown> {
	return {
		type: "message",
		message: {
			role: "assistant",
			model,
			usage: { input, output, cacheRead: 3, cacheWrite: 2, cost: fullCost(total) },
		},
	};
}

function child(model: unknown, cost: number, input = 40, output = 8): Record<string, unknown> {
	return { model, usage: { input, output, cacheRead: 2, cacheWrite: 1, cost } };
}

function native(id: unknown, results: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		type: "message",
		id,
		message: { role: "toolResult", toolName: "subagent", details: { results } },
		...extra,
	};
}

function line(value: unknown): string {
	return JSON.stringify(value);
}

function reasonCodes(result: ReturnType<typeof rollup>): CoverageReasonCode[] {
	return result.reasons.map((reason) => reason.code);
}

function row(result: ReturnType<typeof rollup>, model: string) {
	const found = result.byModel.find((candidate) => candidate.model === model);
	expect(found).toBeDefined();
	if (found === undefined) throw new Error(`expected model row ${model}`);
	return found;
}

test("sums realistic eligible main assistant records per model and overall", () => {
	const result = rollup([line(main(" gpt-5.5 ", 0.02)), line(main("gpt-5.5", 0.03)), line(main("gpt-5.4", 0.01))]);
	expect(result.grand.input).toBeCloseTo(0.03, 12);
	expect(result.grand.output).toBeCloseTo(0.018, 12);
	expect(result.grand.cacheRead).toBeCloseTo(0.006, 12);
	expect(result.grand.cacheWrite).toBeCloseTo(0.006, 12);
	expect(result.grand.total).toBeCloseTo(0.06, 12);
	const gpt55 = row(result, "gpt-5.5");
	expect(gpt55).toMatchObject({ model: "gpt-5.5", calls: 2, tokensIn: 200, tokensOut: 40 });
	expect(gpt55.cost.input).toBeCloseTo(0.025, 12);
	expect(gpt55.cost.output).toBeCloseTo(0.015, 12);
	expect(gpt55.cost.cacheRead).toBeCloseTo(0.005, 12);
	expect(gpt55.cost.cacheWrite).toBeCloseTo(0.005, 12);
	expect(gpt55.cost.total).toBeCloseTo(0.05, 12);
	expect(result.coverage).toBe("complete");
});

test("ignores non-main usage look-alikes and assistant tool requests as native candidates", () => {
	const usage = { input: 1, output: 1, cost: fullCost(90) };
	const result = rollup([
		line({ type: "message", message: { role: "user", model: "fake", usage } }),
		line({ type: "message", message: { role: "toolResult", toolName: "other", model: "fake", usage } }),
		line({ type: "custom", message: { role: "assistant", model: "fake", usage } }),
		line({
			type: "message",
			message: { role: "assistant", model: "main", content: [{ type: "toolCall", name: "subagent" }], usage: { cost: fullCost(0.01) } },
		}),
	]);
	expect(result.grand.total).toBe(0.01);
	expect(result.byModel.map((candidate) => candidate.model)).toEqual(["main"]);
	expect(result.rawNativeCandidates).toBe(0);
	expect(result.subagentCalls).toBe(0);
});

test("accepts single and parallel native results exactly once", () => {
	const result = rollup([
		line(main("main-model", 0.02)),
		line(native("call-1", [child("child-a", 0.04, 30, 6)])),
		line(native("call-2", [child("child-a", 0.05, 50, 10), child("child-b", 0.06, 60, 12)])),
	]);
	expect(result.rawNativeCandidates).toBe(2);
	expect(result.subagentCalls).toBe(2);
	expect(result.duplicateNativeCalls).toBe(0);
	expect(result.acceptedNativeChildren).toBe(3);
	expect(row(result, "child-a")).toMatchObject({ calls: 2, tokensIn: 80, tokensOut: 16, cost: { total: 0.09 } });
	expect(result.persistedSubagentCost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.15 });
	expect(result.grand.total).toBeCloseTo(0.17, 12);
	expect(result.coverage).toBe("complete");
});

test("trims IDs, rejects duplicate native details before validation, and processes whitespace-only and absent IDs", () => {
	const result = rollup([
		line(native(" call-1 ", [child("first", 0.01)])),
		line(native("call-1", [child("duplicate", 50), { usage: { cost: "bad" } }])),
		line(native("   ", [child("blank-id", 0.02)])),
		line(native(undefined, [child("absent-id", 0.03)])),
		line(native(42, [child("non-string-id", 0.04)])),
	]);
	expect(result.rawNativeCandidates).toBe(5);
	expect(result.subagentCalls).toBe(4);
	expect(result.duplicateNativeCalls).toBe(1);
	expect(result.acceptedNativeChildren).toBe(4);
	expect(result.grand.total).toBeCloseTo(0.1, 12);
	expect(result.byModel.some((candidate) => candidate.model === "duplicate")).toBe(false);
	expect(reasonCodes(result)).toEqual(["duplicate-native-call", "idless-native-call"]);
	expect(result.reasons).toEqual([
		{ code: "duplicate-native-call", count: 1 },
		{ code: "idless-native-call", count: 3 },
	]);
});

test("reports missing details, non-array results, and empty results as malformed processed containers", () => {
	const missing = native("missing", []);
	(missing.message as Record<string, unknown>).details = undefined;
	const nonArray = native("non-array", []);
	((nonArray.message as Record<string, unknown>).details as Record<string, unknown>).results = {};
	const result = rollup([line(missing), line(nonArray), line(native("empty", []))]);
	expect(result.rawNativeCandidates).toBe(3);
	expect(result.subagentCalls).toBe(3);
	expect(result.reasons).toEqual([
		{ code: "malformed-native-container", count: 3 },
		{ code: "no-usable-subagent-cost", count: 3 },
	]);
	expect(result.persistedSubagentCost).toBeNull();
});

test("isolates malformed native children while accepting valid siblings", () => {
	const result = rollup([
		line(native("mixed", [null, { model: "bad", usage: { cost: "0.2" } }, { model: "negative", usage: { cost: 0.1, input: -1 } }, child("good", 0.07)])),
	]);
	expect(result.acceptedNativeChildren).toBe(1);
	expect(row(result, "good")).toMatchObject({ calls: 1, tokensIn: 40, tokensOut: 8, cost: { total: 0.07 } });
	expect(result.reasons).toEqual([{ code: "malformed-native-child", count: 3 }]);
});

test("malformed main values are isolated and numeric strings are not coerced", () => {
	const negative = main("bad-negative", 0.01);
	((negative.message as Record<string, unknown>).usage as Record<string, unknown>).input = -1;
	const stringTotal = main("bad-string", 0.01);
	(((stringTotal.message as Record<string, unknown>).usage as Record<string, unknown>).cost as Record<string, unknown>).total = "0.01";
	const result = rollup([line(negative), line(stringTotal), line(main("good", 0.03)), "", "not json"]);
	expect(result.grand.total).toBe(0.03);
	expect(result.byModel.map((candidate) => candidate.model)).toEqual(["good"]);
	expect(result.reasons).toEqual([{ code: "malformed-main", count: 2 }]);
});

test("uses source-specific fallback labels and merges only exact trimmed explicit labels", () => {
	const result = rollup([
		line(main(undefined, 0.01)),
		line(main(42, 0.02)),
		line(main("   ", 0.03)),
		line(main("shared", 0.04)),
		line(native("models", [child(undefined, 0.05), child(42, 0.06), child(" ", 0.07), child(" shared ", 0.08)])),
	]);
	expect(row(result, "main/unknown")).toMatchObject({ calls: 3, cost: { total: 0.06 } });
	expect(row(result, "subagent/unknown")).toMatchObject({ calls: 3, cost: { total: 0.18 } });
	expect(row(result, "shared")).toMatchObject({ calls: 2, cost: { total: 0.12 } });
});

test("selects two legacy annotations as fallback without inventing calls or tokens", () => {
	const result = rollup([
		line({ subagentCost: fullCost(0.1) }),
		line({ subagentCost: fullCost(0.2) }),
		line(main("main", 0.03)),
	]);
	expect(result.persistedSubagentCost?.total).toBeCloseTo(0.3, 12);
	expect(result.grand.total).toBeCloseTo(0.33, 12);
	const legacy = row(result, "subagent/unknown");
	expect(legacy).toMatchObject({ model: "subagent/unknown", calls: 0, tokensIn: 0, tokensOut: 0 });
	expect(legacy.cost.input).toBeCloseTo(0.15, 12);
	expect(legacy.cost.output).toBeCloseTo(0.09, 12);
	expect(legacy.cost.cacheRead).toBeCloseTo(0.03, 12);
	expect(legacy.cost.cacheWrite).toBeCloseTo(0.03, 12);
	expect(legacy.cost.total).toBeCloseTo(0.3, 12);
	expect(result.reasons).toEqual([{ code: "legacy-fallback", count: 2 }]);
});

test("native usage has session-wide precedence over valid legacy annotations", () => {
	const result = rollup([
		line({ subagentCost: fullCost(10) }),
		line(native("native", [child("child", 0.2)], { subagentCost: fullCost(20) })),
	]);
	expect(result.persistedSubagentCost?.total).toBe(0.2);
	expect(result.grand.total).toBe(0.2);
	expect(result.byModel.map((candidate) => candidate.model)).toEqual(["child"]);
	expect(result.reasons).toEqual([{ code: "ignored-legacy-annotation", count: 2 }]);
});

test("collects legacy independently from a rejected duplicate and does not let its valid child activate native precedence", () => {
	const result = rollup([
		line(native("same", [])),
		line(native(" same ", [child("must-not-enter", 8)], { subagentCost: fullCost(0.12) })),
	]);
	expect(result.rawNativeCandidates).toBe(2);
	expect(result.subagentCalls).toBe(1);
	expect(result.duplicateNativeCalls).toBe(1);
	expect(result.acceptedNativeChildren).toBe(0);
	expect(result.grand.total).toBe(0.12);
	expect(result.byModel.some((candidate) => candidate.model === "must-not-enter")).toBe(false);
	expect(reasonCodes(result)).toEqual(["duplicate-native-call", "malformed-native-container", "legacy-fallback"]);
});

test("reports malformed legacy independently while retaining valid native usage", () => {
	const result = rollup([
		line({ subagentCost: null }),
		line({ subagentCost: { total: -1 } }),
		line(native("valid", [child("child", 0.04)])),
	]);
	expect(result.grand.total).toBe(0.04);
	expect(result.reasons).toEqual([{ code: "malformed-legacy-annotation", count: 2 }]);
});

test("counts processed calls with no accepted native child when no legacy is selected", () => {
	const result = rollup([
		line(native("good", [child("child", 0.04)])),
		line(native("bad", [{ usage: { cost: "bad" } }])),
	]);
	expect(result.persistedSubagentCost?.total).toBe(0.04);
	expect(result.reasons).toEqual([
		{ code: "malformed-native-child", count: 1 },
		{ code: "no-usable-subagent-cost", count: 1 },
	]);
});

test("rejects an overflowing main atomically and accepts a later independent main", () => {
	const first = main("huge", 1e308, 1e308, 1e308);
	const overflow = main("huge", 1e308, 1e308, 1e308);
	const result = rollup([line(first), line(overflow), line(main("later", 0.25, 2, 3))]);
	expect(row(result, "huge")).toMatchObject({ calls: 1, tokensIn: 1e308, tokensOut: 1e308, cost: { total: 1e308 } });
	expect(row(result, "later")).toMatchObject({ calls: 1, tokensIn: 2, tokensOut: 3, cost: { total: 0.25 } });
	expect(result.reasons).toEqual([{ code: "aggregate-overflow", count: 1 }]);
});

test("rejects an overflowing native child atomically and accepts a later sibling", () => {
	const result = rollup([
		line(native("overflow-child", [child("huge-child", 1e308, 1e308, 1e308), child("huge-child", 1e308, 1e308, 1e308), child("later-child", 0.25, 2, 3)])),
	]);
	expect(row(result, "huge-child")).toMatchObject({ calls: 1, tokensIn: 1e308, tokensOut: 1e308, cost: { total: 1e308 } });
	expect(row(result, "later-child")).toMatchObject({ calls: 1, tokensIn: 2, tokensOut: 3, cost: { total: 0.25 } });
	expect(result.acceptedNativeChildren).toBe(2);
	expect(result.reasons).toEqual([{ code: "aggregate-overflow", count: 1 }]);
});

test("rejects an overflowing legacy annotation atomically and accepts a later annotation", () => {
	const huge = { input: 1e308, output: 1e308, cacheRead: 1e308, cacheWrite: 1e308, total: 1e308 };
	const result = rollup([line({ subagentCost: huge }), line({ subagentCost: huge }), line({ subagentCost: fullCost(0.4) })]);
	expect(row(result, "subagent/unknown")).toMatchObject({ calls: 0, tokensIn: 0, tokensOut: 0, cost: { total: 1e308 } });
	expect(result.reasons).toEqual([
		{ code: "legacy-fallback", count: 2 },
		{ code: "aggregate-overflow", count: 1 },
	]);
});

test("text and HTML share exact positive reason counts in canonical order", () => {
	const malformedMain = main("bad", 0.01);
	((malformedMain.message as Record<string, unknown>).usage as Record<string, unknown>).output = "bad";
	const first = native("dupe", [child("native", 0.03)]);
	const result = rollup([
		line(malformedMain),
		line(malformedMain),
		line(first),
		line(native(" dupe ", [child("ignored", 9)])),
		line(native(" ", [{}, child("native", 0.02), null, child("native", 0.01), { usage: { cost: -1 } }])),
		line({ subagentCost: fullCost(3) }),
	]);
	const expected = [
		"malformed-main: 2",
		"duplicate-native-call: 1",
		"idless-native-call: 1",
		"malformed-native-child: 3",
		"ignored-legacy-annotation: 1",
	];
	expect(result.reasons.map((reason) => `${reason.code}: ${reason.count}`)).toEqual(expected);
	for (const rendered of [renderText(result), renderHtml(result, "session")]) {
		let previous = -1;
		for (const reason of expected) {
			const firstIndex = rendered.indexOf(reason);
			expect(firstIndex).toBeGreaterThan(previous);
			expect(rendered.indexOf(reason, firstIndex + 1)).toBe(-1);
			previous = firstIndex;
		}
		expect(rendered).not.toContain("malformed-native-container:");
		expect(rendered).not.toContain("aggregate-overflow:");
		expect(rendered).toContain("coverage: incomplete");
	}
});

test("HTML escapes every metacharacter in dynamic labels, filename, coverage, and reasons", () => {
	const result = rollup([line(main(`<m&"'>`, 0.01))]);
	const hostile = {
		...result,
		coverage: `<bad&"'>`,
		reasons: [{ code: `<reason&"'>`, count: 1 }],
	} as unknown as Parameters<typeof renderHtml>[0];
	const html = renderHtml(hostile, `<session&"'>.jsonl`);
	expect(html).toContain("&lt;session&amp;&quot;&#39;&gt;.jsonl");
	expect(html).toContain("&lt;m&amp;&quot;&#39;&gt;");
	expect(html).toContain("coverage: &lt;bad&amp;&quot;&#39;&gt;");
	expect(html).toContain("&lt;reason&amp;&quot;&#39;&gt;: 1");
	expect(html).not.toContain(`<session&"'>`);
	expect(html).not.toContain(`<m&"'>`);
});

test("empty session is a complete zero total", () => {
	const result = rollup(["", "not json", "null"]);
	expect(result.grand).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
	expect(result.byModel).toEqual([]);
	expect(result.persistedSubagentCost).toBeNull();
	expect(result.rawNativeCandidates).toBe(0);
	expect(result.subagentCalls).toBe(0);
	expect(result.coverage).toBe("complete");
	expect(result.reasons).toEqual([]);
});

test("shipped recipe help describes valid persisted parent ToolResult usage", () => {
	const justfile = readFileSync(join(import.meta.dir, "..", "justfile.opsx"), "utf8");
	const recipeStart = justfile.indexOf("session-cost session *flags:");
	const help = justfile.slice(justfile.lastIndexOf("\n#", recipeStart), recipeStart);
	expect(help).toContain("valid persisted parent subagent ToolResult usage");
	expect(help).not.toContain("TUI-only");
	expect(help).not.toContain("NOT persisted");
});
