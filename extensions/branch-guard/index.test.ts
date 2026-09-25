import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import branchGuard from "./index.ts";

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

async function decision(command: string, branch = "main"): Promise<Decision> {
	let handler: Handler | undefined;
	const root = mkdtempSync(join(tmpdir(), "branch-guard-test-"));
	try {
		mkdirSync(join(root, ".git"));
		writeFileSync(join(root, ".git", "HEAD"), `ref: refs/heads/${branch}\n`);
		process.chdir(root);
		process.env.PI_TOOL_EVENT_MODE = "synthetic-test";
		process.env.PI_TOOL_EVENT_TEST_PATH = join(root, "events.jsonl");
		branchGuard({
			on(name: string, registered: Handler): void {
				if (name === "tool_call") handler = registered;
			},
		});
		if (handler === undefined) throw new Error("branch-guard did not register a handler");
		return await handler({ toolName: "bash", input: { command } });
	} finally {
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
}

test("protected-branch commit is blocked with explicit repository-context guidance", async () => {
	const result = await decision("git commit -m change");
	expect(result?.block).toBe(true);
	expect(result?.reason).toContain("separate invocation");
	expect(result?.reason).toContain("intended repository working directory");
	expect(result?.reason).toContain("explicit branch context");
	expect(result?.reason).toContain("Do not blindly allow or retry the commit");
});

test("a chained directory change does not bypass protected-branch context", async () => {
	const result = await decision("cd /tmp/feature-repo && git commit -m change");
	expect(result?.block).toBe(true);
	expect(result?.reason).toContain("separate invocation");
});

test("feature-branch commit remains allowed", async () => {
	await expect(decision("git commit -m change", "feature/guard-message")).resolves.toBeUndefined();
});

test("explicit protected push remains blocked", async () => {
	const result = await decision("git push origin HEAD:main", "feature/guard-message");
	expect(result?.block).toBe(true);
});
