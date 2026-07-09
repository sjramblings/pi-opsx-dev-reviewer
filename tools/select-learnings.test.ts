import { test, expect } from "bun:test";
import {
	globToRegExp,
	parseFrontmatter,
	selectLearnings,
	type Learning,
} from "./select-learnings.ts";

function mk(over: Partial<Learning>): Learning {
	return {
		id: "LRN-X",
		type: "review-rule",
		scope: [],
		tags: [],
		severity: "medium",
		status: "active",
		summary: "s",
		source_change: "c",
		source_commit: "abc123",
		created: "2026-07-08",
		file: "learnings/x.md",
		...over,
	};
}

test("glob ** spans path segments, * does not span slash", () => {
	expect(globToRegExp("extensions/**/index.ts").test("extensions/a/b/index.ts")).toBe(true);
	expect(globToRegExp("extensions/*/index.ts").test("extensions/a/index.ts")).toBe(true);
	expect(globToRegExp("extensions/*/index.ts").test("extensions/a/b/index.ts")).toBe(false);
	expect(globToRegExp("src/**").test("src/auth/login.ts")).toBe(true);
	expect(globToRegExp("src/**").test("other/x.ts")).toBe(false);
});

test("scope match selects the learning", () => {
	const l = mk({ id: "LRN-1", scope: ["extensions/**/index.ts"] });
	const { selected } = selectLearnings([l], ["extensions/foo/index.ts"]);
	expect(selected.map((x) => x.id)).toEqual(["LRN-1"]);
});

test("non-active status is filtered out (draft, retired)", () => {
	const draft = mk({ id: "LRN-D", status: "draft", scope: ["**"] });
	const retired = mk({ id: "LRN-R", status: "retired", scope: ["**"] });
	const { selected, trace } = selectLearnings([draft, retired], ["any/file.ts"]);
	expect(selected).toEqual([]);
	expect(trace).toContain("reject LRN-D status=draft");
	expect(trace).toContain("reject LRN-R status=retired");
});

test("no false positive: unmatched scope is not selected", () => {
	const l = mk({ id: "LRN-2", scope: ["src/auth/**"] });
	const { selected, trace } = selectLearnings([l], ["docs/readme.md"]);
	expect(selected).toEqual([]);
	expect(trace).toContain("reject LRN-2 no-scope-match");
});

test("cold start: no learnings returns clean empty", () => {
	const { selected, trace } = selectLearnings([], ["a.ts"]);
	expect(selected).toEqual([]);
	expect(trace).toEqual([]);
});

test("rename: matches on the new path git reports", () => {
	const l = mk({ id: "LRN-3", scope: ["lib/**"] });
	// git diff --name-only reports the new path for a rename.
	const { selected } = selectLearnings([l], ["lib/moved-here.ts"]);
	expect(selected.map((x) => x.id)).toEqual(["LRN-3"]);
});

test("cap bounds the result and trace records it", () => {
	const many = Array.from({ length: 25 }, (_, i) =>
		mk({ id: "LRN-" + i, scope: ["**"], severity: "low" }),
	);
	const { selected, trace } = selectLearnings(many, ["x.ts"], { cap: 20 });
	expect(selected.length).toBe(20);
	expect(trace).toContain("capped 25 -> 20");
});

test("ordering: severity desc then created desc", () => {
	const lo = mk({ id: "LRN-lo", scope: ["**"], severity: "low", created: "2026-01-01" });
	const hi = mk({ id: "LRN-hi", scope: ["**"], severity: "high", created: "2026-01-01" });
	const midNew = mk({ id: "LRN-mid", scope: ["**"], severity: "medium", created: "2026-12-01" });
	const { selected } = selectLearnings([lo, hi, midNew], ["x.ts"]);
	expect(selected.map((x) => x.id)).toEqual(["LRN-hi", "LRN-mid", "LRN-lo"]);
});

test("parseFrontmatter reads nested source block and inline list", () => {
	const fm = parseFrontmatter(
		[
			"---",
			"id: LRN-9",
			"scope: [a/**, b/*]",
			"tags: [x, y]",
			"source:",
			"  change: my-change",
			"  commit: deadbeef",
			"---",
			"body",
		].join("\n"),
	);
	expect(fm.id).toBe("LRN-9");
	expect(fm.scope).toEqual(["a/**", "b/*"]);
	expect((fm.source as Record<string, string>).commit).toBe("deadbeef");
});
