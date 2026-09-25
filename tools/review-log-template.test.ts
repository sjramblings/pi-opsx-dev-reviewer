import { expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const read = (path: string): string => readFileSync(path, "utf8");

function assertOrchestratorLedgerProtocol(template: string): void {
	const prose = template.replace(/\s+/g, " ");
	expect(prose).not.toContain("The developer appends");
	expect(prose).toContain("The orchestrator appends each");
	expect(prose).toContain("before the developer ticks the task");
	expect(prose).toContain("two-argument `just record-verdict` command rendered by the active `/opsx-loop`");
	expect(prose).toContain("exact absolute `File:` path copied from pi's built-in `/session`");
	expect(prose).toContain("Session discovery fails closed");
	expect(prose).toContain("`/session` reports `In-memory`");
	expect(prose).toContain("never guess a path or select the newest session");
}

function instructionTemplate(value: unknown): string {
	if (typeof value !== "object" || value === null || !("template" in value)) {
		throw new Error("OpenSpec instructions response is missing template");
	}
	const template = value.template;
	if (typeof template !== "string") {
		throw new Error("OpenSpec instructions response template is not a string");
	}
	return template;
}

test("a new dev-reviewer change resolves an orchestrator-owned fail-closed ledger template", () => {
	const root = mkdtempSync(join(tmpdir(), "review-log-template-test-"));
	try {
		const schemasDir = join(root, "openspec", "schemas");
		mkdirSync(schemasDir, { recursive: true });
		cpSync("openspec/schemas/dev-reviewer", join(schemasDir, "dev-reviewer"), { recursive: true });
		writeFileSync(join(root, "openspec", "config.yaml"), "schema: dev-reviewer\n");

		const created = Bun.spawnSync(
			["openspec", "new", "change", "generated-ledger", "--schema", "dev-reviewer", "--json"],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		if (created.exitCode !== 0) {
			throw new Error(`openspec new change failed: ${created.stderr.toString()}`);
		}

		const instructions = Bun.spawnSync(
			["openspec", "instructions", "review-report", "--change", "generated-ledger", "--json"],
			{ cwd: root, stdout: "pipe", stderr: "pipe" },
		);
		if (instructions.exitCode !== 0) {
			throw new Error(`openspec instructions failed: ${instructions.stderr.toString()}`);
		}
		const response: unknown = JSON.parse(instructions.stdout.toString());
		assertOrchestratorLedgerProtocol(instructionTemplate(response));
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("the standalone review-log template carries the same ledger protocol", () => {
	assertOrchestratorLedgerProtocol(read("templates/review-log.md"));
});
