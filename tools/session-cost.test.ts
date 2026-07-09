import { test, expect } from "bun:test";
import { rollup, renderText } from "./session-cost.ts";

function msg(model: string, cost: number, tin = 100, tout = 20): string {
	return JSON.stringify({
		type: "message",
		message: {
			role: "assistant",
			model,
			usage: { input: tin, output: tout, cacheRead: 0, cacheWrite: 0, totalTokens: tin + tout, cost: { input: cost * 0.6, output: cost * 0.4, cacheRead: 0, cacheWrite: 0, total: cost } },
		},
	});
}

test("sums cost per model and a grand total", () => {
	const r = rollup([msg("gpt-5.5", 0.02), msg("gpt-5.5", 0.03), msg("gpt-5.4", 0.01)]);
	expect(r.grand.total).toBeCloseTo(0.06, 6);
	expect(r.byModel[0].model).toBe("gpt-5.5"); // sorted by cost desc
	expect(r.byModel[0].cost.total).toBeCloseTo(0.05, 6);
	expect(r.byModel[0].calls).toBe(2);
	expect(r.byModel[0].tokensIn).toBe(200);
});

test("counts subagent calls and reports them as not persisted", () => {
	const subCall = JSON.stringify({
		type: "message",
		message: { role: "assistant", model: "gpt-5.5", content: [{ type: "toolCall", name: "subagent" }], usage: { cost: { total: 0.01 } } },
	});
	const r = rollup([subCall, msg("gpt-5.5", 0.02)]);
	expect(r.subagentCalls).toBe(1);
	expect(r.persistedSubagentCost).toBeNull();
	expect(renderText(r)).toContain("NOT in this session");
});

test("includes a persisted subagent-cost annotation when present (forward-compat)", () => {
	const annotated = JSON.stringify({ subagentCost: { input: 0.05, output: 0.05, cacheRead: 0, cacheWrite: 0, total: 0.1 } });
	const r = rollup([annotated, msg("gpt-5.5", 0.02)]);
	expect(r.persistedSubagentCost?.total).toBeCloseTo(0.1, 6);
	expect(renderText(r)).toContain("subagent cost (persisted): $0.1000");
});

test("tolerates blank and malformed lines", () => {
	const r = rollup(["", "not json", msg("gpt-5.5", 0.02), "  "]);
	expect(r.grand.total).toBeCloseTo(0.02, 6);
});

test("empty session is clean zero", () => {
	const r = rollup([]);
	expect(r.grand.total).toBe(0);
	expect(r.byModel).toEqual([]);
	expect(r.subagentCalls).toBe(0);
});
