import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import forceDelegate from "./index.ts";

type Decision = { block: true; reason: string } | undefined;
type ToolCallEvent = { toolName: string; input?: unknown };
type Handler = (event: ToolCallEvent) => Decision | Promise<Decision>;

const originalDepth = process.env.PI_SUBAGENT_DEPTH;
const originalLoaded = process.env.__FORCE_DELEGATE_LOADED;
const originalToolEventMode = process.env.PI_TOOL_EVENT_MODE;
const originalToolEventTestPath = process.env.PI_TOOL_EVENT_TEST_PATH;
const originalCwd = process.cwd();

afterEach(() => {
	if (originalDepth === undefined) {
		delete process.env.PI_SUBAGENT_DEPTH;
	} else {
		process.env.PI_SUBAGENT_DEPTH = originalDepth;
	}
	if (originalLoaded === undefined) {
		delete process.env.__FORCE_DELEGATE_LOADED;
	} else {
		process.env.__FORCE_DELEGATE_LOADED = originalLoaded;
	}
	if (originalToolEventMode === undefined) {
		delete process.env.PI_TOOL_EVENT_MODE;
	} else {
		process.env.PI_TOOL_EVENT_MODE = originalToolEventMode;
	}
	if (originalToolEventTestPath === undefined) {
		delete process.env.PI_TOOL_EVENT_TEST_PATH;
	} else {
		process.env.PI_TOOL_EVENT_TEST_PATH = originalToolEventTestPath;
	}
	process.chdir(originalCwd);
});

async function decisionFor(toolName: string, input?: unknown): Promise<Decision> {
	delete process.env.PI_SUBAGENT_DEPTH;
	let handler: Handler | undefined;
	const tempDir = mkdtempSync(join(tmpdir(), "force-delegate-test-"));
	try {
		process.env.PI_TOOL_EVENT_MODE = "synthetic-test";
		process.env.PI_TOOL_EVENT_TEST_PATH = join(tempDir, "tool-events.jsonl");
		process.chdir(tempDir);
		forceDelegate({
			on(name: "tool_call", registered: Handler): void {
				if (name === "tool_call") handler = registered;
			},
		});
		if (!handler) throw new Error("force-delegate did not register a tool_call handler");
		return await handler({ toolName: toolName, input: input });
	} finally {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	}
}

async function bashDecision(command: string): Promise<Decision> {
	return decisionFor("bash", { command: command });
}

test("main bash allows just archive-change", async () => {
	await expect(bashDecision("just archive-change add-foo")).resolves.toBeUndefined();
});

test("main bash allows just record-verdict", async () => {
	await expect(
		bashDecision("just record-verdict add-foo session.jsonl"),
	).resolves.toBeUndefined();
});

test("main bash allows approved read-only just recipes", async () => {
	for (const command of [
		"just tool-events",
		"just learnings-audit",
		"just check-learnings",
		"just learnings-preview",
		"just next add-architecture-diagrams",
	]) {
		await expect(bashDecision(command)).resolves.toBeUndefined();
	}
});

test("main bash allows documented tool-events flags", async () => {
	await expect(
		bashDecision("just tool-events --session /tmp/session.jsonl --min 2"),
	).resolves.toBeUndefined();
});

test("main bash blocks unsupported arguments on read-only just recipes", async () => {
	const decision = await bashDecision("just learnings-audit unexpected");
	expect(decision?.block).toBe(true);
});

test("main bash blocks just deploy", async () => {
	const decision = await bashDecision("just deploy");
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("developer subagent");
});

test("main bash blocks bare just", async () => {
	const decision = await bashDecision("just");
	expect(decision?.block).toBe(true);
});

test("main bash blocks redirection around an admitted recipe", async () => {
	const decision = await bashDecision("just archive-change add-foo > /tmp/out");
	expect(decision?.block).toBe(true);
});

test("main bash blocks --out on an admitted recipe", async () => {
	const decision = await bashDecision("just archive-change add-foo --out /tmp/x");
	expect(decision?.block).toBe(true);
});

test("main bash blocks -o on an admitted recipe", async () => {
	const decision = await bashDecision("just archive-change add-foo -o /tmp/x");
	expect(decision?.block).toBe(true);
});

test("main bash blocks --out= on an admitted recipe", async () => {
	const decision = await bashDecision("just archive-change add-foo --out=/tmp/x");
	expect(decision?.block).toBe(true);
});

test("main bash blocks inline environment assignment", async () => {
	const decision = await bashDecision("GIT_PAGER=rm just archive-change add-foo");
	expect(decision?.block).toBe(true);
});

test("main bash blocks an admitted recipe chained with rm", async () => {
	const decision = await bashDecision(
		"just record-verdict add-foo session.jsonl && rm -rf src",
	);
	expect(decision?.block).toBe(true);
});

test("main bash blocks a backgrounded admitted recipe", async () => {
	const decision = await bashDecision("just archive-change add-foo &");
	expect(decision?.block).toBe(true);
});

test("main bash allows pipes inside double-quoted search patterns", async () => {
	await expect(bashDecision("rg -n \"a|b\" file")).resolves.toBeUndefined();
});

test("main bash allows pipes inside single-quoted search patterns", async () => {
	await expect(bashDecision("rg -n 'a|b' file")).resolves.toBeUndefined();
});

test("main bash blocks real pipelines", async () => {
	for (const command of ["rg -n a file | sh", "ls | xargs rm"]) {
		const decision = await bashDecision(command);
		expect(decision?.block).toBe(true);
	}
});

test("main bash blocks dangerous syntax even around quoted text", async () => {
	const backtick = String.fromCharCode(96);
	for (const command of [
		"echo \"x\" > f",
		"echo \"$(ls)\"",
		"echo " + backtick + "ls" + backtick,
	]) {
		const decision = await bashDecision(command);
		expect(decision?.block).toBe(true);
	}
});

test("main bash blocks an unbalanced quote", async () => {
	const decision = await bashDecision("rg -n \"a file");
	expect(decision?.block).toBe(true);
});

test("main bash keeps direct write blocked", async () => {
	const decision = await decisionFor("write", { path: "src/app.ts", content: "x" });
	expect(decision?.block).toBe(true);
	expect(decision?.reason).toContain("developer subagent");
});

test("main bash keeps direct edit blocked", async () => {
	const decision = await decisionFor("edit", { path: "src/app.ts" });
	expect(decision?.block).toBe(true);
});

test("main bash keeps arbitrary mutation blocked", async () => {
	const decision = await bashDecision("sed -i s/a/b/ src/app.ts");
	expect(decision?.block).toBe(true);
});

test("inherited synthetic telemetry environment cannot drop a real blocked event", async () => {
	delete process.env.PI_SUBAGENT_DEPTH;
	process.env.PI_TOOL_EVENT_MODE = "synthetic-test";
	const tempDir = mkdtempSync(join(tmpdir(), "force-delegate-runtime-event-"));
	process.env.PI_TOOL_EVENT_TEST_PATH = join(tempDir, "spoofed.jsonl");
	let handler: Handler | undefined;
	try {
		process.chdir(tempDir);
		forceDelegate({
			on(name: "tool_call", registered: Handler): void {
				if (name === "tool_call") handler = registered;
			},
		});
		if (!handler) throw new Error("force-delegate did not register a tool_call handler");
		const decision = await handler({ toolName: "bash", input: { command: "rm -rf src" } });
		expect(decision?.block).toBe(true);
		const record = JSON.parse(readFileSync(join(tempDir, "memory", "tool-events.jsonl"), "utf8"));
		expect(record).toMatchObject({
			eventKind: "runtime",
			guard: "force-delegate",
			tool: "bash",
			target: "rm -rf src",
		});
		expect(() => readFileSync(process.env.PI_TOOL_EVENT_TEST_PATH!, "utf8")).toThrow();
	} finally {
		process.chdir(originalCwd);
		rmSync(tempDir, { recursive: true, force: true });
	}
});

test("depth and inherited handshake follow the explicit 28-case producer matrix", () => {
	const depthVectors: Array<{ label: string; value: string | undefined; child: boolean }> = [
		{ label: "maximum safe positive child", value: " 9007199254740991 ", child: true },
		{ label: "unset", value: undefined, child: false },
		{ label: "zero", value: "0", child: false },
		{ label: "malformed", value: "abc", child: false },
		{ label: "negative", value: "-1", child: false },
		{ label: "non-integer", value: "1.5", child: false },
		{ label: "unsafe integer", value: "9007199254740992", child: false },
	];
	const handshakeVectors: Array<{ label: string; value: string | undefined }> = [
		{ label: "current PID", value: String(process.pid) },
		{ label: "unset", value: undefined },
		{ label: "stale PID", value: String(process.pid + 1) },
		{ label: "malformed", value: "not-a-pid" },
	];
	let exercised = 0;

	for (const depth of depthVectors) {
		for (const handshake of handshakeVectors) {
			exercised++;
			if (depth.value === undefined) delete process.env.PI_SUBAGENT_DEPTH;
			else process.env.PI_SUBAGENT_DEPTH = depth.value;
			if (handshake.value === undefined) delete process.env.__FORCE_DELEGATE_LOADED;
			else process.env.__FORCE_DELEGATE_LOADED = handshake.value;

			let handler: Handler | undefined;
			forceDelegate({
				on(name: "tool_call", registered: Handler): void {
					if (name === "tool_call") handler = registered;
				},
			});

			const cell = depth.label + " x " + handshake.label;
			if (depth.child) {
				expect(handler, cell).toBeUndefined();
				expect(process.env.__FORCE_DELEGATE_LOADED, cell).toBe(handshake.value);
			} else {
				expect(handler, cell).toBeDefined();
				expect(process.env.__FORCE_DELEGATE_LOADED, cell).toBe(String(process.pid));
			}
		}
	}

	expect(exercised).toBe(28);
});
