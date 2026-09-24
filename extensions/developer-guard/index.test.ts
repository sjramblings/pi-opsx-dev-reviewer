import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import developerGuard from "./index.ts";

type Decision = { block: true; reason: string } | undefined;
type Event = { toolName: string; input?: { command?: string } };
type Handler = (event: Event) => Promise<Decision>;

const originalCwd = process.cwd();
const originalMode = process.env.PI_TOOL_EVENT_MODE;
const originalTestPath = process.env.PI_TOOL_EVENT_TEST_PATH;

function restoreEnv(name: "PI_TOOL_EVENT_MODE" | "PI_TOOL_EVENT_TEST_PATH", value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

afterEach(() => {
	process.chdir(originalCwd);
	restoreEnv("PI_TOOL_EVENT_MODE", originalMode);
	restoreEnv("PI_TOOL_EVENT_TEST_PATH", originalTestPath);
});

async function decision(command: string): Promise<Decision> {
	let handler: Handler | undefined;
	const root = mkdtempSync(join(tmpdir(), "developer-guard-test-"));
	try {
		process.env.PI_TOOL_EVENT_MODE = "synthetic-test";
		process.env.PI_TOOL_EVENT_TEST_PATH = join(root, "events.jsonl");
		process.chdir(root);
		developerGuard({
			on(name: string, registered: Handler): void {
				if (name === "tool_call") handler = registered;
			},
		});
		if (handler === undefined) throw new Error("developer-guard did not register a handler");
		return await handler({ toolName: "bash", input: { command } });
	} finally {
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
}

test("recursive force cleanup is blocked with a scoped non-force alternative", async () => {
	const result = await decision("rm -rf /tmp/build-output");
	expect(result?.block).toBe(true);
	expect(result?.reason).toContain("rm -r -- <verified-temp-path>");
	expect(result?.reason).toContain("verified temporary tree");
});

test("scoped non-force recursive cleanup remains allowed", async () => {
	await expect(decision("rm -r -- /tmp/verified-build-output")).resolves.toBeUndefined();
});

test("other catastrophic commands remain blocked without misleading cleanup advice", async () => {
	const result = await decision("git reset --hard HEAD");
	expect(result?.block).toBe(true);
	expect(result?.reason).not.toContain("rm -r --");
});
