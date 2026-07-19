import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import architectScope from "./index.ts";

type Decision = { block: true; reason: string } | undefined;
type Event = { toolName: string; input?: unknown };
type Handler = (event: Event) => Promise<Decision>;
type InputFactory = (cwd: string) => unknown;

const originalStack = process.env.PI_SUBAGENT_STACK;
const originalCwd = process.cwd();

afterEach(() => {
	if (originalStack === undefined) {
		delete process.env.PI_SUBAGENT_STACK;
	} else {
		process.env.PI_SUBAGENT_STACK = originalStack;
	}
	process.chdir(originalCwd);
});

async function decisionForInput(
	agent: string | undefined,
	input: unknown | InputFactory,
	toolName = "write",
): Promise<Decision> {
	if (agent === undefined) {
		delete process.env.PI_SUBAGENT_STACK;
	} else {
		process.env.PI_SUBAGENT_STACK = JSON.stringify([agent]);
	}

	let handler: Handler | undefined;
	architectScope({
		on(name: "tool_call", registered: Handler): void {
			if (name === "tool_call") handler = registered;
		},
	});

	if (!handler) throw new Error("architect-scope did not register a tool_call handler");

	const tempDir = mkdtempSync(join(tmpdir(), "architect-scope-test-"));
	try {
		process.chdir(tempDir);
		const eventInput = typeof input === "function" ? input(tempDir) : input;
		return await handler({ toolName: toolName, input: eventInput });
	} finally {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	}
}

async function decisionFor(agent: string | undefined, path: string, toolName = "write"): Promise<Decision> {
	return decisionForInput(agent, { path: path }, toolName);
}

test("architecture-writer can write inside docs architecture", async () => {
	await expect(decisionFor("architecture-writer", "docs/architecture/README.md")).resolves.toBeUndefined();
});

test("architecture-writer can write inside docs architecture with leading current directory", async () => {
	await expect(decisionFor("architecture-writer", "./docs/architecture/README.md")).resolves.toBeUndefined();
});

test("architecture-writer can write inside docs architecture with absolute repo path", async () => {
	await expect(
		decisionForInput("architecture-writer", (cwd) => ({
			path: join(cwd, "docs", "architecture", "README.md"),
		})),
	).resolves.toBeUndefined();
});

test("architecture-writer is blocked from nested temp docs architecture", async () => {
	const decision = await decisionFor("architecture-writer", "tmp/docs/architecture/README.md");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("docs/architecture/**");
});

test("architecture-writer is blocked from template docs architecture", async () => {
	const decision = await decisionFor("architecture-writer", "templates/docs/architecture/section.md");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("docs/architecture/**");
});

test("architecture-writer is blocked from docs decisions", async () => {
	const decision = await decisionFor("architecture-writer", "docs/decisions/0003.md");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("solution-architect");
});

test("architecture-writer is blocked from dot segment escape to decisions", async () => {
	const decision = await decisionFor("architecture-writer", "docs/architecture/../decisions/0003.md");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("docs/architecture/**");
});

test("architecture-writer is blocked from dot segment escape to code", async () => {
	const decision = await decisionFor("architecture-writer", "docs/architecture/../../src/app.ts");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("docs/architecture/**");
});

test("architecture-writer is blocked from code", async () => {
	const decision = await decisionFor("architecture-writer", "extensions/architect-scope/index.ts");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("docs/architecture/**");
});

test("architecture-writer is blocked when target path is missing", async () => {
	const decision = await decisionForInput("architecture-writer", { content: "x" });
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("docs/architecture/**");
});

test("developer resolution remains unrestricted", async () => {
	await expect(decisionFor("developer", "src/app.ts")).resolves.toBeUndefined();
});

test("tech-writer resolution remains unrestricted", async () => {
	await expect(decisionFor("tech-writer", "src/app.ts")).resolves.toBeUndefined();
});

test("reviewer resolution remains design artifact only", async () => {
	await expect(decisionFor("reviewer", "design.md")).resolves.toBeUndefined();
	const decision = await decisionFor("reviewer", "tmp/out.md");
	expect(decision?.block).toBe(true);
});

test("spec-reviewer resolution remains design artifact only", async () => {
	await expect(decisionFor("spec-reviewer", "design.md")).resolves.toBeUndefined();
	const decision = await decisionFor("spec-reviewer", "tmp/out.md");
	expect(decision?.block).toBe(true);
});

test("architecture-writer can write inside docs architecture under a symlinked repo root", async () => {
	await expect(
		decisionForInput("architecture-writer", (cwd) => ({
			path: join(realpathSync(cwd), "docs", "architecture", "README.md"),
		})),
	).resolves.toBeUndefined();
});

test("solution-architect resolution remains design artifact only", async () => {
	await expect(decisionFor("solution-architect", "docs/decisions/0001.md")).resolves.toBeUndefined();
	await expect(decisionFor("solution-architect", "./design.md")).resolves.toBeUndefined();
	const decision = await decisionFor("solution-architect", "src/app.ts");
	expect(decision?.block).toBe(true);
});

test("unidentified resolution remains design artifact only", async () => {
	await expect(decisionFor(undefined, "design.md")).resolves.toBeUndefined();
	await expect(decisionFor(undefined, "./design.md")).resolves.toBeUndefined();
	const decision = await decisionFor(undefined, "src/app.ts");
	expect(decision?.block).toBe(true);
});

test("evolution-narrator can write thesis.json", async () => {
	await expect(decisionFor("evolution-narrator", "thesis.json")).resolves.toBeUndefined();
});

test("evolution-narrator is blocked from the tool", async () => {
	const decision = await decisionFor("evolution-narrator", "tools/evolution-timeline.ts");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("thesis.json");
});

test("evolution-narrator is blocked from design artifacts (no fall-through)", async () => {
	const decision = await decisionFor("evolution-narrator", "design.md");
	expect(decision?.block).toBe(true);
});

async function bashDecision(agent, command) {
	if (agent === undefined) delete process.env.PI_SUBAGENT_STACK;
	else process.env.PI_SUBAGENT_STACK = JSON.stringify([agent]);
	let handler;
	architectScope({ on(name, registered) { if (name === "tool_call") handler = registered; } });
	return handler({ toolName: "bash", input: { command } });
}

test("architecture-writer bash: read-only allowed", async () => {
	await expect(bashDecision("architecture-writer", "grep -r foo docs/")).resolves.toBeUndefined();
});
test("architecture-writer bash: just arch-lint allowed", async () => {
	await expect(bashDecision("architecture-writer", "just arch-lint")).resolves.toBeUndefined();
});
test("architecture-writer bash: just architecture-html allowed", async () => {
	await expect(bashDecision("architecture-writer", "just architecture-html")).resolves.toBeUndefined();
});
test("architecture-writer bash: sed -i outside scope blocked", async () => {
	const d = await bashDecision("architecture-writer", "sed -i s/a/b/ src/app.ts");
	expect(d?.block).toBe(true);
});
test("architecture-writer bash: redirection blocked", async () => {
	const d = await bashDecision("architecture-writer", "echo x > src/app.ts");
	expect(d?.block).toBe(true);
});
test("architecture-writer bash: command substitution blocked", async () => {
	const d = await bashDecision("architecture-writer", "cat $(ls)");
	expect(d?.block).toBe(true);
});
test("architecture-writer bash: bun on another tool blocked", async () => {
	const d = await bashDecision("architecture-writer", "bun tools/waf-grounding.ts");
	expect(d?.block).toBe(true);
});
test("architecture-writer bash: chained write blocked", async () => {
	const d = await bashDecision("architecture-writer", "just arch-lint && rm -rf src");
	expect(d?.block).toBe(true);
});
test("developer bash: not gated by architect-scope", async () => {
	await expect(bashDecision("developer", "rm -rf whatever")).resolves.toBeUndefined();
});
