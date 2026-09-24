import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import harnessSelftest from "./index.ts";

type TestContext = {
	ui?: { notify?: (message: string, level?: "error") => void };
	shutdown?: () => void;
};
type Handler = (event: unknown, context: TestContext) => unknown;
type Decision = { block: true; reason: string } | undefined;
type InputDecision = { action: "handled" } | undefined;
type UserBashDecision = {
	result: {
		output: string;
		exitCode: number | undefined;
		cancelled: boolean;
		truncated: boolean;
	};
} | undefined;

type RunResult = {
	decision: Decision;
	inputDecision: InputDecision;
	userBashDecision: UserBashDecision;
	notifications: string[];
	shutdowns: number;
	exitCodes: number[];
	stderr: string;
};

const originalCwd = process.cwd();
const originalDepth = process.env.PI_SUBAGENT_DEPTH;
const originalLoaded = process.env.__FORCE_DELEGATE_LOADED;
const originalStderrWrite = process.stderr.write;
const originalExit = process.exit;

function restoreEnv(name: "PI_SUBAGENT_DEPTH" | "__FORCE_DELEGATE_LOADED", value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

afterEach(() => {
	process.chdir(originalCwd);
	restoreEnv("PI_SUBAGENT_DEPTH", originalDepth);
	restoreEnv("__FORCE_DELEGATE_LOADED", originalLoaded);
	process.stderr.write = originalStderrWrite;
	process.exit = originalExit;
});

function setEnv(name: "PI_SUBAGENT_DEPTH" | "__FORCE_DELEGATE_LOADED", value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

function runSelftest(options: {
	marker: boolean;
	depth: string | undefined;
	handshake: string | undefined;
	context?: TestContext;
}): RunResult {
	const root = mkdtempSync(join(tmpdir(), "harness-selftest-test-"));
	const handlers = new Map<string, Handler>();
	const notifications: string[] = [];
	const exitCodes: number[] = [];
	let shutdowns = 0;
	let stderr = "";
	try {
		if (options.marker) writeFileSync(join(root, ".harness-marker"), "worktree-isolation\n");
		process.chdir(root);
		setEnv("PI_SUBAGENT_DEPTH", options.depth);
		setEnv("__FORCE_DELEGATE_LOADED", options.handshake);
		process.stderr.write = ((chunk: string | Uint8Array): boolean => {
			stderr += String(chunk);
			return true;
		}) as typeof process.stderr.write;
		process.exit = ((code?: string | number | null): never => {
			exitCodes.push(typeof code === "number" ? code : 0);
			return undefined as never;
		}) as typeof process.exit;
		harnessSelftest({
			on(name: string, handler: Handler): void {
				handlers.set(name, handler);
			},
		});
		const context = options.context ?? {
			ui: {
				notify(message: string): void {
					notifications.push(message);
				},
			},
			shutdown(): void {
				shutdowns++;
			},
		};
		const sessionHandler = handlers.get("session_start");
		const inputHandler = handlers.get("input");
		const toolHandler = handlers.get("tool_call");
		const userBashHandler = handlers.get("user_bash");
		if (!sessionHandler || !inputHandler || !toolHandler || !userBashHandler) {
			throw new Error("harness-selftest did not register all required handlers");
		}
		sessionHandler({ reason: "startup" }, context);
		return {
			decision: toolHandler({ toolName: "write", input: { path: "unsafe.ts" } }, context) as Decision,
			inputDecision: inputHandler({ text: "continue" }, context) as InputDecision,
			userBashDecision: userBashHandler(
				{ command: "touch unsafe", excludeFromContext: false, cwd: root },
				context,
			) as UserBashDecision,
			notifications: notifications,
			shutdowns: shutdowns,
			exitCodes: exitCodes,
			stderr: stderr,
		};
	} finally {
		process.stderr.write = originalStderrWrite;
		process.exit = originalExit;
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
}

test("marker decisions follow the explicit 28-case depth and handshake matrix", () => {
	const depthVectors: Array<{ label: string; value: string | undefined; child: boolean }> = [
		{ label: "maximum safe positive child", value: " 9007199254740991 ", child: true },
		{ label: "unset", value: undefined, child: false },
		{ label: "zero", value: "0", child: false },
		{ label: "malformed", value: "abc", child: false },
		{ label: "negative", value: "-1", child: false },
		{ label: "non-integer", value: "1.5", child: false },
		{ label: "unsafe integer", value: "9007199254740992", child: false },
	];
	const handshakeVectors: Array<{ label: string; value: string | undefined; current: boolean }> = [
		{ label: "current PID", value: String(process.pid), current: true },
		{ label: "unset", value: undefined, current: false },
		{ label: "stale PID", value: String(process.pid + 1), current: false },
		{ label: "malformed", value: "not-a-pid", current: false },
	];
	let exercised = 0;

	for (const depth of depthVectors) {
		for (const handshake of handshakeVectors) {
			exercised++;
			const result = runSelftest({ marker: true, depth: depth.value, handshake: handshake.value });
			const cell = depth.label + " x " + handshake.label;
			const halted = !depth.child && !handshake.current;
			if (halted) {
				expect(result.decision?.block, cell).toBe(true);
				expect(result.decision?.reason, cell).toContain("just worktree");
				expect(result.inputDecision, cell).toEqual({ action: "handled" });
				expect(result.userBashDecision, cell).toEqual({
					result: {
						output: result.decision?.reason,
						exitCode: undefined,
						cancelled: true,
						truncated: false,
					},
				});
				expect(result.notifications, cell).toHaveLength(1);
				expect(result.shutdowns, cell).toBe(1);
				expect(result.exitCodes, cell).toEqual([1]);
				expect(result.stderr, cell).toContain("HARNESS UNGUARDED");
			} else {
				expect(result.decision, cell).toBeUndefined();
				expect(result.inputDecision, cell).toBeUndefined();
				expect(result.userBashDecision, cell).toBeUndefined();
				expect(result.notifications, cell).toEqual([]);
				expect(result.shutdowns, cell).toBe(0);
				expect(result.exitCodes, cell).toEqual([]);
				expect(result.stderr, cell).toBe("");
			}
		}
	}

	expect(exercised).toBe(28);
});

test("bare marker-bearing top-level session halts and blocks with repair guidance", () => {
	const result = runSelftest({ marker: true, depth: undefined, handshake: undefined });
	expect(result.decision).toMatchObject({ block: true });
	expect(result.decision?.reason).toContain("primary checkout");
	expect(result.decision?.reason).toContain("remove the unsafe worktree");
	expect(result.decision?.reason).toContain("just worktree <name>");
	expect(result.inputDecision).toEqual({ action: "handled" });
	expect(result.userBashDecision).toMatchObject({
		result: { cancelled: true, truncated: false },
	});
	expect(result.userBashDecision?.result.output).toBe(result.decision?.reason);
	expect(result.notifications).toHaveLength(1);
	expect(result.shutdowns).toBe(1);
	expect(result.exitCodes).toEqual([1]);
	expect(result.stderr).toContain("HARNESS UNGUARDED");
});

test("provisioned marker-bearing top-level session proceeds", () => {
	const result = runSelftest({ marker: true, depth: undefined, handshake: String(process.pid) });
	expect(result).toEqual({
		decision: undefined,
		inputDecision: undefined,
		userBashDecision: undefined,
		notifications: [],
		shutdowns: 0,
		exitCodes: [],
		stderr: "",
	});
});

test("directory without marker stays silent and non-blocking", () => {
	const result = runSelftest({ marker: false, depth: "abc", handshake: "not-a-pid" });
	expect(result).toEqual({
		decision: undefined,
		inputDecision: undefined,
		userBashDecision: undefined,
		notifications: [],
		shutdowns: 0,
		exitCodes: [],
		stderr: "",
	});
});

test("valid child with inherited stale handshake stays silent with full tools", () => {
	const result = runSelftest({
		marker: true,
		depth: " 9007199254740991 ",
		handshake: String(process.pid + 1),
	});
	expect(result).toEqual({
		decision: undefined,
		inputDecision: undefined,
		userBashDecision: undefined,
		notifications: [],
		shutdowns: 0,
		exitCodes: [],
		stderr: "",
	});
});

test("notification and shutdown failures are loud without disabling the tool block", () => {
	const result = runSelftest({
		marker: true,
		depth: undefined,
		handshake: undefined,
		context: {
			ui: {
				notify(): void {
					throw new Error("notify unavailable");
				},
			},
			shutdown(): void {
				throw new Error("shutdown unavailable");
			},
		},
	});
	expect(result.decision?.block).toBe(true);
	expect(result.userBashDecision?.result.cancelled).toBe(true);
	expect(result.exitCodes).toEqual([1]);
	expect(result.stderr).toContain("notification failed after HALT: notify unavailable");
	expect(result.stderr).toContain("shutdown failed after HALT: shutdown unavailable");
});
