import { afterEach, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { pathToFileURL } from "url";
import worktreeCanary from "./index.ts";

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

type PiChildResult = {
	status: number;
	stdout: string;
	stderr: string;
	outputExists: boolean;
};

type LoadedExtensions = {
	extensions: unknown[];
	errors: unknown[];
	runtime: unknown;
};

type RunnerInstance = {
	emit: (event: { type: "session_start"; reason: "startup" }) => Promise<unknown>;
	emitUserBash: (event: {
		type: "user_bash";
		command: string;
		excludeFromContext: boolean;
		cwd: string;
	}) => Promise<UserBashDecision>;
};

type PiRunnerModule = {
	discoverAndLoadExtensions: (
		configuredPaths: string[],
		cwd: string,
		agentDir: string,
	) => Promise<LoadedExtensions>;
	ExtensionRunner: new (
		extensions: unknown[],
		runtime: unknown,
		cwd: string,
		sessionManager: unknown,
		modelRegistry: null,
	) => RunnerInstance;
	SessionManager: { inMemory: (cwd: string) => unknown };
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

function runCanary(options: {
	marker: boolean;
	depth: string | undefined;
	handshake: string | undefined;
	context?: TestContext;
}): RunResult {
	const root = mkdtempSync(join(tmpdir(), "worktree-canary-test-"));
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
		worktreeCanary({
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
			throw new Error("worktree-canary did not register all required handlers");
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
			const result = runCanary({ marker: true, depth: depth.value, handshake: handshake.value });
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

test("bare marker-bearing top-level session halts and blocks with provisioning guidance", () => {
	const result = runCanary({ marker: true, depth: undefined, handshake: undefined });
	expect(result.decision).toMatchObject({ block: true });
	expect(result.decision?.reason).toContain("primary checkout");
	expect(result.decision?.reason).toContain("remove it and recreate");
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
	const result = runCanary({ marker: true, depth: undefined, handshake: String(process.pid) });
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
	const result = runCanary({ marker: false, depth: "abc", handshake: "not-a-pid" });
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
	const result = runCanary({
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

function runRealPiFirstCommand(
	extensionPath: string,
	command: "export_html" | "bash",
	marker: boolean,
): PiChildResult {
	const root = mkdtempSync(join(tmpdir(), "worktree-canary-pi-child-"));
	const sessionPath = join(root, "session.jsonl");
	const outputPath = join(root, command + "-sentinel.html");
	try {
		if (marker) writeFileSync(join(root, ".harness-marker"), "worktree-isolation\n");
		writeFileSync(
			sessionPath,
			JSON.stringify({
				type: "session",
				version: 3,
				id: "11111111-1111-4111-8111-111111111111",
				timestamp: "2026-01-01T00:00:00.000Z",
				cwd: root,
			}) + "\n" + JSON.stringify({
				type: "message",
				id: "a1b2c3d4",
				parentId: null,
				timestamp: "2026-01-01T00:00:01.000Z",
				message: { role: "user", content: "export probe", timestamp: 1767225601000 },
			}) + "\n",
		);
		const piExecutable = Bun.which("pi");
		if (piExecutable === null) throw new Error("pi executable is required for child coverage");
		const env = { ...process.env };
		delete env.PI_SUBAGENT_DEPTH;
		delete env.__FORCE_DELEGATE_LOADED;
		env.PI_OFFLINE = "1";
		const rpcCommand = command === "export_html"
			? { id: "first", type: "export_html", outputPath: outputPath }
			: { id: "first", type: "bash", command: "printf guarded > " + outputPath };
		const child = spawnSync(
			piExecutable,
			[
				"--mode", "rpc",
				"--session", sessionPath,
				"--no-extensions",
				"--no-skills",
				"--no-prompt-templates",
				"--no-themes",
				"--no-context-files",
				"--offline",
				"--extension", extensionPath,
			],
			{
				cwd: root,
				env: env,
				input: JSON.stringify(rpcCommand) + "\n",
				encoding: "utf8",
				timeout: 10_000,
				killSignal: "SIGKILL",
			},
		);
		if (child.error !== undefined) {
			throw new Error("pi child execution failed: " + child.error.message);
		}
		if (typeof child.status !== "number") {
			throw new Error("pi child ended without an exit status; signal=" + String(child.signal));
		}
		if (typeof child.stdout !== "string" || typeof child.stderr !== "string") {
			throw new Error("pi child returned non-text output");
		}
		return {
			status: child.status,
			stdout: child.stdout,
			stderr: child.stderr,
			outputExists: existsSync(outputPath),
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function parseRpcResponse(stdout: string, expectedCommand: string): Record<string, unknown> {
	const lines = stdout.trim().split("\n").filter((line) => line.length > 0);
	if (lines.length !== 1) throw new Error("expected one RPC response, received " + lines.length);
	const parsed: unknown = JSON.parse(lines[0]);
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("RPC response was not an object");
	}
	const response = parsed as Record<string, unknown>;
	if (
		response.type !== "response" ||
		response.command !== expectedCommand ||
		response.success !== true
	) {
		throw new Error("RPC response had an unexpected shape: " + JSON.stringify(response));
	}
	return response;
}

test("real pi 0.83 exits before first export or bash command can write", () => {
	const piExecutable = Bun.which("pi");
	if (piExecutable === null) throw new Error("pi executable is required for child coverage");
	const version = spawnSync(piExecutable, ["--version"], {
		encoding: "utf8",
		timeout: 10_000,
		killSignal: "SIGKILL",
	});
	if (version.error !== undefined) {
		throw new Error("pi version probe failed: " + version.error.message);
	}
	if (version.status !== 0 || typeof version.stdout !== "string") {
		throw new Error(
			"pi version probe returned invalid output: status=" + String(version.status) +
			" signal=" + String(version.signal),
		);
	}
	expect(version.stdout.trim()).toBe("0.83.0");

	const canaryPath = join(import.meta.dir, "index.ts");
	const selftestPath = join(import.meta.dir, "..", "harness-selftest", "index.ts");
	const baseline = runRealPiFirstCommand(canaryPath, "export_html", false);
	expect(baseline.status).toBe(0);
	expect(baseline.outputExists).toBe(true);
	parseRpcResponse(baseline.stdout, "export_html");

	for (const extensionPath of [canaryPath, selftestPath]) {
		const haltedExport = runRealPiFirstCommand(extensionPath, "export_html", true);
		expect(haltedExport.status, extensionPath).toBe(1);
		expect(haltedExport.outputExists, extensionPath).toBe(false);
		expect(haltedExport.stdout, extensionPath).not.toContain("\"command\":\"export_html\"");
		expect(haltedExport.stderr, extensionPath).toContain("HARNESS UNGUARDED");
		expect(haltedExport.stderr, extensionPath).toContain("just worktree <name>");

		const haltedBash = runRealPiFirstCommand(extensionPath, "bash", true);
		expect(haltedBash.status, extensionPath).toBe(1);
		expect(haltedBash.outputExists, extensionPath).toBe(false);
		expect(haltedBash.stdout, extensionPath).not.toContain("\"command\":\"bash\"");
		expect(haltedBash.stderr, extensionPath).toContain("HARNESS UNGUARDED");
	}
}, 40_000);

async function loadPiRunnerModule(): Promise<PiRunnerModule> {
	const piExecutable = Bun.which("pi");
	if (piExecutable === null) throw new Error("pi executable is required for ExtensionRunner coverage");
	const packageEntry = join(dirname(realpathSync(piExecutable)), "index.js");
	const imported: unknown = await import(pathToFileURL(packageEntry).href);
	if (typeof imported !== "object" || imported === null) {
		throw new Error("pi package entry did not export an object");
	}
	const candidate = imported as Record<string, unknown>;
	const sessionManager = candidate.SessionManager as { inMemory?: unknown } | undefined;
	if (
		candidate.VERSION !== "0.83.0" ||
		typeof candidate.discoverAndLoadExtensions !== "function" ||
		typeof candidate.ExtensionRunner !== "function" ||
		typeof candidate.SessionManager !== "function" ||
		typeof sessionManager?.inMemory !== "function"
	) {
		throw new Error("pi 0.83 package entry lacks the required ExtensionRunner exports");
	}
	return imported as PiRunnerModule;
}

async function runnerBashDecision(options: {
	marker: boolean;
	depth: string | undefined;
	handshake: string | undefined;
}): Promise<UserBashDecision> {
	const root = mkdtempSync(join(tmpdir(), "worktree-canary-runner-test-"));
	try {
		if (options.marker) writeFileSync(join(root, ".harness-marker"), "worktree-isolation\n");
		process.exit = (() => undefined as never) as typeof process.exit;
		process.chdir(root);
		setEnv("PI_SUBAGENT_DEPTH", options.depth);
		setEnv("__FORCE_DELEGATE_LOADED", options.handshake);
		const piRunner = await loadPiRunnerModule();
		const loaded: unknown = await piRunner.discoverAndLoadExtensions(
			[join(import.meta.dir, "index.ts")],
			root,
			join(root, "agent"),
		);
		if (typeof loaded !== "object" || loaded === null) {
			throw new Error("worktree-canary runner loader returned a non-object");
		}
		const loadResult = loaded as LoadedExtensions;
		if (
			!Array.isArray(loadResult.errors) ||
			!Array.isArray(loadResult.extensions) ||
			loadResult.runtime === undefined
		) {
			throw new Error("worktree-canary runner loader returned an invalid shape");
		}
		if (loadResult.errors.length !== 0 || loadResult.extensions.length !== 1) {
			throw new Error("worktree-canary runner load failed: " + JSON.stringify(loadResult.errors));
		}
		const runner = new piRunner.ExtensionRunner(
			loadResult.extensions,
			loadResult.runtime,
			root,
			piRunner.SessionManager.inMemory(root),
			// The tested handlers do not access model state.
			null,
		);
		await runner.emit({ type: "session_start", reason: "startup" });
		return await runner.emitUserBash({
			type: "user_bash",
			command: "touch unsafe",
			excludeFromContext: false,
			cwd: root,
		});
	} finally {
		process.exit = originalExit;
		process.chdir(originalCwd);
		rmSync(root, { recursive: true, force: true });
	}
}

test("ExtensionRunner cancels halted user bash and preserves every pass-through boundary", async () => {
	const halted = await runnerBashDecision({
		marker: true,
		depth: undefined,
		handshake: undefined,
	});
	expect(halted).toMatchObject({
		result: {
			cancelled: true,
			truncated: false,
		},
	});
	expect(halted?.result.output).toContain("just worktree <name>");
	expect(halted?.result.exitCode).toBeUndefined();

	for (const passThrough of [
		{ marker: true, depth: undefined, handshake: String(process.pid) },
		{ marker: true, depth: " 1 ", handshake: undefined },
		{ marker: false, depth: undefined, handshake: undefined },
	]) {
		await expect(runnerBashDecision(passThrough)).resolves.toBeUndefined();
	}
}, 15_000);

test("notification and shutdown failures are loud without disabling the tool block", () => {
	const result = runCanary({
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
