import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import learningsInject from "./index.ts";

type SentMessage = {
	customType: string;
	content: string;
	display: boolean;
};

type SessionStart = (event: unknown, ctx: { cwd: string }) => Promise<void>;

const originalBase = process.env.LEARNINGS_INJECT_BASE;
const roots: string[] = [];

afterEach(() => {
	if (originalBase === undefined) delete process.env.LEARNINGS_INJECT_BASE;
	else process.env.LEARNINGS_INJECT_BASE = originalBase;
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]): void {
	const result = Bun.spawnSync(["git", ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.toString() || `git ${args.join(" ")} failed`);
	}
}

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "learnings-inject-test-"));
	roots.push(root);
	mkdirSync(join(root, "tools"), { recursive: true });
	mkdirSync(join(root, "learnings"), { recursive: true });
	cpSync(join(import.meta.dir, "..", "..", "tools", "select-learnings.ts"), join(root, "tools", "select-learnings.ts"));
	writeFileSync(
		join(root, "learnings", "LRN-TEST.md"),
		[
			"---",
			"schema_version: 1",
			"id: LRN-TEST",
			"type: bug-class",
			"scope: [\"extensions/**/index.ts\"]",
			"tags: [loader]",
			"severity: high",
			"status: active",
			"summary: Keep extension source loader-safe.",
			"source:",
			"  change: fixture",
			"  commit: 0000000",
			"created: 2026-01-01",
			"---",
		].join("\n"),
	);
	writeFileSync(join(root, "README.md"), "fixture\n");
	git(root, ["init", "-q", "-b", "main"]);
	git(root, ["add", "."]);
	git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base"]);
	return root;
}

async function sessionStart(root: string): Promise<SentMessage> {
	let handler: SessionStart | undefined;
	let sent: SentMessage | undefined;
	learningsInject({
		on(name: string, registered: SessionStart) {
			if (name === "session_start") handler = registered;
		},
		sendMessage(message: SentMessage) {
			sent = message;
		},
	});
	if (!handler) throw new Error("session_start handler was not registered");
	await handler({}, { cwd: root });
	if (!sent) throw new Error("session_start did not inject a message");
	return sent;
}

test("injects selector output for the derived changed-file scope", async () => {
	const root = fixture();
	mkdirSync(join(root, "extensions", "example"), { recursive: true });
	writeFileSync(join(root, "extensions", "example", "index.ts"), "export default {};\n");

	const message = await sessionStart(root);

	expect(message.customType).toBe("learnings-inject");
	expect(message.display).toBe(true);
	expect(message.content).toContain("status: scope-derived");
	expect(message.content).toContain("changed files: 1");
	expect(message.content).toContain("[LRN-TEST]");
});

test("reports a successful empty scope as cold-start clean-empty", async () => {
	const message = await sessionStart(fixture());

	expect(message.content).toContain("status: scope-derived-empty");
	expect(message.content).toContain("changed files: 0");
	expect(message.content).toContain("No relevant learnings for the changed files.");
	expect(message.content).not.toContain("SCOPE UNKNOWN");
});

test("reports unknown scope instead of a healthy empty selection", async () => {
	const root = mkdtempSync(join(tmpdir(), "learnings-inject-no-git-"));
	roots.push(root);

	const message = await sessionStart(root);

	expect(message.content).toContain("status: SCOPE UNKNOWN");
	expect(message.content).toContain("could not be derived");
	expect(message.content).not.toContain("No relevant learnings for the changed files.");
});
