import { test, expect } from "bun:test";
import { tierOf, parseRows, serializeRows, applyLog, type Row } from "./trust.ts";

test("tierOf boundaries", () => {
	expect(tierOf(0, 0)).toBe("watch"); // < 10 runs
	expect(tierOf(9, 9)).toBe("watch"); // still < 10 runs
	expect(tierOf(10, 9)).toBe("queue"); // 9/10 = 0.9 -> not < 0.9 and >=10 runs, so queue
	expect(tierOf(10, 8)).toBe("watch"); // 80% < 90%
	expect(tierOf(15, 15)).toBe("queue"); // 100% but < 20 runs
	expect(tierOf(20, 19)).toBe("auto"); // 95%
	expect(tierOf(20, 18)).toBe("queue"); // 90% -> not auto, not watch
});

test("10 runs at exactly 90% is queue, not watch", () => {
	expect(tierOf(10, 9)).toBe("queue");
});

test("parse and serialize round-trip", () => {
	const rows = parseRows("fix-lint\t20\t19\nbump-deps\t5\t5");
	expect(rows.get("fix-lint")).toEqual({ skill: "fix-lint", runs: 20, pass: 19 });
	expect(serializeRows(rows)).toBe("bump-deps\t5\t5\nfix-lint\t20\t19"); // sorted
});

test("applyLog accumulates", () => {
	const rows = new Map<string, Row>();
	applyLog(rows, "s", "pass");
	applyLog(rows, "s", "fail");
	applyLog(rows, "s", "pass");
	expect(rows.get("s")).toEqual({ skill: "s", runs: 3, pass: 2 });
});

test("applyLog flags a demotion crossing into watch", () => {
	// Build a skill at 10 runs / 10 pass (queue... actually 100% <20 = queue), then fail down.
	const rows = new Map<string, Row>();
	for (let i = 0; i < 10; i++) applyLog(rows, "s", "pass"); // 10/10 -> queue
	// now drive fails until it crosses below 90%: 10p/11r=90.9% queue; 10/12=83% -> watch
	applyLog(rows, "s", "fail"); // 10/11 -> queue
	const { demoted } = applyLog(rows, "s", "fail"); // 10/12 -> watch
	expect(demoted).toBe(true);
});

test("no demotion flag under 10 runs", () => {
	const rows = new Map<string, Row>();
	const { demoted } = applyLog(rows, "s", "fail"); // 0/1, watch but only 1 run
	expect(demoted).toBe(false);
});
