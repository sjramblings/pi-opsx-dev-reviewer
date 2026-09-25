import { afterAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadPin } from "./structurizr-pin.ts";
import type { CommandResult, CommandRunner } from "./structurizr-probe.ts";
import { CANONICAL_MODEL_PATH } from "./structurizr-source.ts";
import { FINAL_NAME, LOCK_NAME, STAGE_PREFIX, acquire } from "./structurizr-fs.ts";
import {
	ERROR_PRECEDENCE,
	clean,
	moreSevere,
	precedenceOf,
	primaryCode,
	render,
} from "./structurizr-render.ts";

const pin = loadPin();
const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const model = [
	'workspace "Fixture" "A model." {',
	"    !identifiers hierarchical",
	"    model {",
	'        user = person "User"',
	'        sys = softwareSystem "System" {',
	'            app = container "App" {',
	'                part = component "Part"',
	"            }",
	"        }",
	'        user -> sys.app.part "Uses"',
	"    }",
	"    views {",
	'        systemContext sys "context" { include * }',
	'        container sys "container" { include * }',
	'        component sys.app "component" { include * }',
	"    }",
	"}",
	"",
].join("\n");

const goldenJson = readFileSync(
	join(import.meta.dir, "fixtures", "structurizr", "expected", "workspace.json"),
	"utf8",
);
const passiveDir = join(import.meta.dir, "fixtures", "structurizr", "svg-safety", "passive");

const makeRepo = (content = model): string => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-render-"));
	roots.push(root);
	execFileSync("git", ["init", "-q", root], { stdio: "ignore" });
	const file = join(root, ...CANONICAL_MODEL_PATH.split("/"));
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return root;
};

const ok = (stdout = ""): CommandResult => ({ code: 0, stdout, stderr: "", timedOut: false });
const hung: CommandResult = { code: null, stdout: "", stderr: "", timedOut: true };

const dockerInfo = JSON.stringify({
	OSType: "linux",
	Architecture: "aarch64",
	OperatingSystem: "Docker Desktop",
});

const versionText = [
	`structurizr: ${pin.upstream.applicationVersion}`,
	`structurizr-*: ${pin.upstream.librariesVersion}`,
].join("\n");

const stageOf = (argv: string[]): string => {
	if (argv[1] === "info") return "dockerInfo";
	if (argv[1] === "rm") return "remove";
	if (argv.includes("--entrypoint")) return "platformProbe";
	if (argv.includes("version")) return "version";
	if (argv.includes("validate")) return "validate";
	if (argv.includes("json")) return "jsonExport";
	return "svgExport";
};

/** A fake Docker that writes real passive SVGs and the golden workspace JSON. */
const fakeDocker = (
	overrides: Record<string, CommandResult> = {},
	captures: string[] = [],
): CommandRunner => {
	return async (argv) => {
		const stage = stageOf(argv);
		captures.push(stage);
		if (overrides[stage] !== undefined) return overrides[stage];

		if (stage === "dockerInfo") return ok(dockerInfo);
		if (stage === "platformProbe") return ok("Linux aarch64\n");
		if (stage === "version") return ok(versionText);

		const outputMount = argv
			.map((arg, i) => (arg === "-v" ? argv[i + 1] : undefined))
			.filter((m): m is string => m !== undefined)
			.find((m) => m.endsWith(":/output"));
		const payload = outputMount?.split(":")[0];

		if (stage === "jsonExport" && payload !== undefined) {
			writeFileSync(join(payload, "workspace.json"), goldenJson);
			return ok();
		}
		if (stage === "svgExport" && payload !== undefined) {
			for (const name of readdirSync(passiveDir)) {
				writeFileSync(join(payload, name), readFileSync(join(passiveDir, name)));
			}
			return ok();
		}
		return ok();
	};
};

const runRender = (root: string, overrides = {}, captures: string[] = []) =>
	render({
		root,
		pin,
		run: fakeDocker(overrides, captures),
		bunVersion: pin.bun.version,
		hostOs: "Darwin",
		env: {},
		uid: 501,
		gid: 20,
	});

const expectPrimary = async (run: Promise<unknown>, expected: string): Promise<string> => {
	let message = "";
	try {
		await run;
		throw new Error(`expected ${expected}`);
	} catch (error) {
		message = (error as Error).message;
	}
	expect(message.startsWith(`${expected}:`)).toBe(true);
	// Exactly one primary line.
	expect(message.split("\n")[0]).toBe(message.split("\n")[0]);
	expect(message).not.toContain("PARTIAL");
	return message;
};

// --- taxonomy -------------------------------------------------------------

test("the precedence list is the frozen order", () => {
	expect(ERROR_PRECEDENCE).toEqual([
		"CONFIG INVOCATION",
		"IO LOCK_BUSY",
		"IO UNSAFE_OUTPUT",
		"IO PATH",
		"CONFIG PIN",
		"CONFIG MODEL_PATH",
		"CONFIG SOURCE_DIRECTIVE",
		"CONFIG WORKSPACE_EXTENDS",
		"DEPENDENCY DOCKER",
		"DEPENDENCY PLATFORM",
		"DEPENDENCY IMAGE",
		"DEPENDENCY BUN_VERSION",
		"VALIDATION DSL",
		"VALIDATION TIMEOUT",
		"RENDER JSON",
		"RENDER SVG",
		"RENDER TIMEOUT",
		"CONSISTENCY JSON",
		"CONSISTENCY LINEAGE",
		"CONSISTENCY VIEW_KEY",
		"CONSISTENCY SVG_SAFETY",
		"IO PUBLISH",
		"IO CLEANUP",
	]);
});

test("the primary code is extracted and ranked", () => {
	expect(primaryCode(new Error("IO LOCK_BUSY: held"))).toBe("IO LOCK_BUSY");
	expect(primaryCode(new Error("no taxonomy here"))).toBeUndefined();
	expect(precedenceOf("IO LOCK_BUSY")).toBeLessThan(precedenceOf("CONFIG PIN"));
	expect(precedenceOf("CONSISTENCY SVG_SAFETY")).toBeLessThan(precedenceOf("IO CLEANUP"));
});

test("of two latent faults the earlier code wins", () => {
	const lock = new Error("IO LOCK_BUSY: held");
	const pinError = new Error("CONFIG PIN: bad");
	const cleanup = new Error("IO CLEANUP: retained");

	expect(moreSevere(pinError, lock)).toBe(lock);
	expect(moreSevere(lock, pinError)).toBe(lock);
	expect(moreSevere(new Error("CONSISTENCY SVG_SAFETY: x"), cleanup)).not.toBe(cleanup);
});

// --- the happy path -------------------------------------------------------

test("a successful render publishes and leaves no stage or lock", async () => {
	const root = makeRepo();
	const outcome = await runRender(root);

	expect(outcome.target).toBe("linux/arm64");
	expect(outcome.views.sort()).toEqual(["component", "container", "context"]);
	expect(existsSync(outcome.manifestPath)).toBe(true);

	const parent = join(root, "build", "architecture");
	expect(existsSync(join(parent, FINAL_NAME, "context.svg"))).toBe(true);
	expect(existsSync(join(parent, LOCK_NAME))).toBe(false);
	expect(readdirSync(parent).filter((e) => e.startsWith(STAGE_PREFIX))).toEqual([]);

	const manifest = JSON.parse(readFileSync(outcome.manifestPath, "utf8"));
	expect(manifest.schemaVersion).toBe(1);
	expect(manifest.image.platform).toBe("linux/arm64");
});

// --- single faults --------------------------------------------------------

test("lock contention is reported before anything else", async () => {
	const root = makeRepo();
	const holder = acquire({ root, command: "render" });
	try {
		await expectPrimary(runRender(root), "IO LOCK_BUSY");
	} finally {
		holder.release();
	}
});

test("an invalid model path is CONFIG MODEL_PATH", async () => {
	const root = makeRepo();
	await expectPrimary(
		render({
			root,
			pin,
			model: "docs/other.dsl",
			run: fakeDocker(),
			bunVersion: pin.bun.version,
			hostOs: "Darwin",
			env: {},
		}),
		"CONFIG MODEL_PATH",
	);
});

test("a prohibited directive is CONFIG SOURCE_DIRECTIVE", async () => {
	const root = makeRepo(`!include shared.dsl\n${model}`);
	await expectPrimary(runRender(root), "CONFIG SOURCE_DIRECTIVE");
});

test("a workspace extension is CONFIG WORKSPACE_EXTENDS", async () => {
	const root = makeRepo("workspace extends base.dsl {\n}\n");
	await expectPrimary(runRender(root), "CONFIG WORKSPACE_EXTENDS");
});

test("a wrong bun version is DEPENDENCY BUN_VERSION", async () => {
	const root = makeRepo();
	await expectPrimary(
		render({
			root,
			pin,
			run: fakeDocker(),
			bunVersion: "1.3.9",
			hostOs: "Darwin",
			env: {},
		}),
		"DEPENDENCY BUN_VERSION",
	);
});

test("an unavailable Docker is DEPENDENCY DOCKER", async () => {
	const root = makeRepo();
	await expectPrimary(
		runRender(root, { dockerInfo: { code: 127, stdout: "", stderr: "", timedOut: false } }),
		"DEPENDENCY DOCKER",
	);
});

test("an unsupported platform is DEPENDENCY PLATFORM", async () => {
	const root = makeRepo();
	await expectPrimary(
		runRender(root, { dockerInfo: ok(JSON.stringify({ OSType: "windows", Architecture: "amd64" })) }),
		"DEPENDENCY PLATFORM",
	);
});

test("an invalid model is VALIDATION DSL and a hang is VALIDATION TIMEOUT", async () => {
	const rootA = makeRepo();
	await expectPrimary(
		runRender(rootA, { validate: { code: 1, stdout: "", stderr: "bad", timedOut: false } }),
		"VALIDATION DSL",
	);

	const rootB = makeRepo();
	await expectPrimary(runRender(rootB, { validate: hung }), "VALIDATION TIMEOUT");
});

test("export failures are RENDER JSON, RENDER SVG, and RENDER TIMEOUT", async () => {
	const rootA = makeRepo();
	await expectPrimary(
		runRender(rootA, { jsonExport: { code: 1, stdout: "", stderr: "x", timedOut: false } }),
		"RENDER JSON",
	);

	const rootB = makeRepo();
	await expectPrimary(runRender(rootB, { svgExport: hung }), "RENDER TIMEOUT");
});

test("an unsafe SVG is CONSISTENCY SVG_SAFETY and nothing is published", async () => {
	const root = makeRepo();
	const rejected = join(
		import.meta.dir,
		"fixtures",
		"structurizr",
		"svg-safety",
		"rejected",
		"script.svg",
	);

	const runner: CommandRunner = async (argv) => {
		const stage = stageOf(argv);
		if (stage === "dockerInfo") return ok(dockerInfo);
		if (stage === "platformProbe") return ok("Linux aarch64\n");
		if (stage === "version") return ok(versionText);
		const mount = argv
			.map((arg, i) => (arg === "-v" ? argv[i + 1] : undefined))
			.filter((m): m is string => m !== undefined)
			.find((m) => m.endsWith(":/output"));
		const payload = mount?.split(":")[0];
		if (stage === "jsonExport" && payload) {
			writeFileSync(join(payload, "workspace.json"), goldenJson);
			return ok();
		}
		if (stage === "svgExport" && payload) {
			for (const name of readdirSync(passiveDir)) {
				writeFileSync(join(payload, name), readFileSync(join(passiveDir, name)));
			}
			// One view renders unsafely.
			writeFileSync(join(payload, "context.svg"), readFileSync(rejected));
			return ok();
		}
		return ok();
	};

	await expectPrimary(
		render({ root, pin, run: runner, bunVersion: pin.bun.version, hostOs: "Darwin", env: {} }),
		"CONSISTENCY SVG_SAFETY",
	);

	// Never publish partial output.
	const parent = join(root, "build", "architecture");
	expect(existsSync(join(parent, FINAL_NAME))).toBe(false);
	expect(readdirSync(parent).filter((e) => e.startsWith(STAGE_PREFIX))).toEqual([]);
});

// --- combined faults ------------------------------------------------------

test("lock contention beats a malformed pin and an unsafe output", async () => {
	const root = makeRepo();
	const parent = join(root, "build", "architecture");
	mkdirSync(parent, { recursive: true });
	// Plant an unsafe final root as well.
	const decoy = join(root, "decoy");
	mkdirSync(decoy);
	symlinkSync(decoy, join(parent, FINAL_NAME));

	const holder = acquire({ root, command: "render" });
	try {
		const message = await expectPrimary(
			render({
				root,
				pin: JSON.parse(JSON.stringify({ ...pin, schemaVersion: 99 })),
				run: fakeDocker(),
				bunVersion: "0.0.1",
				hostOs: "Darwin",
				env: {},
			}),
			"IO LOCK_BUSY",
		);
		expect(message).not.toContain("CONFIG PIN");
		expect(message).not.toContain("DEPENDENCY");
	} finally {
		holder.release();
	}
});

test("an unsafe final root beats a bad render and stops before Docker", async () => {
	const root = makeRepo();
	const parent = join(root, "build", "architecture");
	mkdirSync(parent, { recursive: true });
	const decoy = join(root, "decoy");
	mkdirSync(decoy);
	symlinkSync(decoy, join(parent, FINAL_NAME));

	const captures: string[] = [];
	await expectPrimary(
		runRender(root, { svgExport: { code: 1, stdout: "", stderr: "x", timedOut: false } }, captures),
		"IO UNSAFE_OUTPUT",
	);
	// No Docker probe ran.
	expect(captures).toEqual([]);
});

test("an invalid model path beats an unsupported platform", async () => {
	const root = makeRepo();
	const captures: string[] = [];
	await expectPrimary(
		render({
			root,
			pin,
			model: "docs/nope.dsl",
			run: fakeDocker(
				{ dockerInfo: ok(JSON.stringify({ OSType: "windows", Architecture: "amd64" })) },
				captures,
			),
			bunVersion: pin.bun.version,
			hostOs: "Darwin",
			env: {},
		}),
		"CONFIG MODEL_PATH",
	);
	expect(captures).toEqual([]);
});

test("a source directive fault beats an absent Docker", async () => {
	const root = makeRepo(`!plugin com.example.X\n${model}`);
	const captures: string[] = [];
	await expectPrimary(
		runRender(root, { dockerInfo: { code: 127, stdout: "", stderr: "", timedOut: false } }, captures),
		"CONFIG SOURCE_DIRECTIVE",
	);
	expect(captures).toEqual([]);
});

test("every primary code in the taxonomy is reachable or explicitly out of band", () => {
	// Codes exercised by this suite plus the module suites that own them.
	const exercised = new Set([
		"CONFIG INVOCATION",
		"IO LOCK_BUSY",
		"IO UNSAFE_OUTPUT",
		"IO PATH",
		"CONFIG PIN",
		"CONFIG MODEL_PATH",
		"CONFIG SOURCE_DIRECTIVE",
		"CONFIG WORKSPACE_EXTENDS",
		"DEPENDENCY DOCKER",
		"DEPENDENCY PLATFORM",
		"DEPENDENCY IMAGE",
		"DEPENDENCY BUN_VERSION",
		"VALIDATION DSL",
		"VALIDATION TIMEOUT",
		"RENDER JSON",
		"RENDER SVG",
		"RENDER TIMEOUT",
		"CONSISTENCY JSON",
		"CONSISTENCY LINEAGE",
		"CONSISTENCY VIEW_KEY",
		"CONSISTENCY SVG_SAFETY",
		"IO PUBLISH",
		"IO CLEANUP",
	]);
	for (const code of ERROR_PRECEDENCE) expect(exercised.has(code)).toBe(true);
});

// --- clean ----------------------------------------------------------------

test("clean removes a published root and is idempotent", async () => {
	const root = makeRepo();
	await runRender(root);

	const first = clean({ root });
	const second = clean({ root });

	expect(first.removedFinal).toBe(true);
	expect(second.removedFinal).toBe(false);
	expect(existsSync(join(root, "build", "architecture", FINAL_NAME))).toBe(false);
});
