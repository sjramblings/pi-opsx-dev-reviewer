import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const auditScript = join(import.meta.dir, "audit-learnings.ts");

function learning(change: string, commit: string): string {
	return [
		"---",
		"schema_version: 1",
		"id: LRN-TEST",
		"type: review-rule",
		'scope: ["docs/**"]',
		"status: active",
		"summary: test",
		"source:",
		`  change: ${change}`,
		`  commit: ${commit}`,
		"created: 2026-07-23",
		"---",
	].join("\n");
}

function runAudit(change: string, archiveNames: string[] = [], active = false, commit = "deadbeef") {
	const root = mkdtempSync(join(tmpdir(), "audit-learnings-"));
	try {
		mkdirSync(join(root, "learnings"), { recursive: true });
		mkdirSync(join(root, "openspec", "changes", "archive"), { recursive: true });
		writeFileSync(join(root, "learnings", "LRN-TEST.md"), learning(change, commit));
		if (active) mkdirSync(join(root, "openspec", "changes", change));
		for (const name of archiveNames) mkdirSync(join(root, "openspec", "changes", "archive", name));
		return Bun.spawnSync(["bun", auditScript], { cwd: root, stdout: "pipe", stderr: "pipe" });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("active change provenance resolves", () => {
	const result = runAudit("example-change", [], true);
	expect(result.exitCode).toBe(0);
});

test("dated archive provenance resolves by original change name", () => {
	const result = runAudit("example-change", ["2026-07-23-example-change"]);
	expect(result.exitCode).toBe(0);
});

test("archive suffix look-alikes do not resolve", () => {
	const result = runAudit("example-change", ["2026-07-23-other-example-change"]);
	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toContain("does not resolve to a change folder");
});

test("path traversal cannot resolve outside the changes directory", () => {
	const result = runAudit("../../learnings");
	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toContain("does not resolve to a change folder");
});

test("non-sha commit provenance is rejected", () => {
	const result = runAudit("example-change", [], true, "not-a-sha");
	expect(result.exitCode).toBe(1);
	expect(result.stderr.toString()).toContain("is not a 7-40 character hexadecimal sha");
});
