import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parsePredicate, isRetired, verifyGoals } from "./verify-goals.ts";

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
