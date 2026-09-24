/*
 * structurizr-probe.ts — bounded live probe of the pinned image and command interface.
 *
 * Runs via bun; not a pi extension.
 *
 * The probe proves that the pinned reference really exposes the pinned interface on a
 * native OCI target. It never requests a cross-target image, so binfmt/QEMU and Docker
 * Desktop Rosetta-for-Linux paths are never eligible. Evidence is complete only when
 * both linux/amd64 and linux/arm64 have executed the fixture natively; one published
 * manifest is not evidence.
 *
 * usage: bun tools/structurizr-probe.ts --live --fixture <path> --require-native <platform>
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { type StructurizrPin, loadPin } from "./structurizr-pin.ts";

export type Target = "linux/amd64" | "linux/arm64";

export const TARGETS: Target[] = ["linux/amd64", "linux/arm64"];

/** The only uname output accepted for each native target. */
export const EXPECTED_UNAME: Record<Target, string> = {
	"linux/amd64": "Linux x86_64",
	"linux/arm64": "Linux aarch64",
};

export type ProbeErrorClass = "DEPENDENCY" | "VALIDATION" | "RENDER";

export class StructurizrProbeError extends Error {
	readonly errorClass: ProbeErrorClass;
	readonly code: string;

	constructor(errorClass: ProbeErrorClass, code: string, detail: string) {
		super(`${errorClass} ${code}: ${detail}`);
		this.errorClass = errorClass;
		this.code = code;
		this.name = "StructurizrProbeError";
	}
}

const dependency = (code: string, detail: string): never => {
	throw new StructurizrProbeError("DEPENDENCY", code, detail);
};

const validation = (code: string, detail: string): never => {
	throw new StructurizrProbeError("VALIDATION", code, detail);
};

const render = (code: string, detail: string): never => {
	throw new StructurizrProbeError("RENDER", code, detail);
};

// --- platform resolution --------------------------------------------------

/** Normalize a Docker server architecture to the pinned OCI vocabulary. */
export const normalizeArchitecture = (architecture: string): "amd64" | "arm64" => {
	if (architecture === "amd64" || architecture === "x86_64") return "amd64";
	if (architecture === "arm64" || architecture === "aarch64") return "arm64";
	return dependency(
		"PLATFORM",
		`unsupported Docker server architecture ${JSON.stringify(architecture)}`,
	);
};

export type DockerInfo = {
	OSType?: unknown;
	Architecture?: unknown;
	OperatingSystem?: unknown;
	KernelVersion?: unknown;
};

/**
 * Derive the OCI target from the Docker server, never from the client process
 * architecture. A Bun process translated by Rosetta is not an OCI container and is
 * neither accepted nor rejected on its own.
 */
export const resolveTarget = (options: {
	info: DockerInfo;
	hostOs: string;
	env: Record<string, string | undefined>;
}): Target => {
	const { info, hostOs, env } = options;

	if (hostOs !== "Linux" && hostOs !== "Darwin") {
		dependency("PLATFORM", `unsupported client OS ${JSON.stringify(hostOs)}`);
	}

	if (typeof info.OSType !== "string" || typeof info.Architecture !== "string") {
		dependency("DOCKER", "docker info did not report OSType and Architecture strings");
	}

	const osType = info.OSType as string;
	if (osType !== "linux") {
		// Windows container mode can never run the pinned Linux image.
		dependency("PLATFORM", `Docker server OSType must be linux, got ${osType}`);
	}

	if (hostOs === "Darwin" && info.OperatingSystem !== "Docker Desktop") {
		dependency(
			"PLATFORM",
			`on Darwin the Docker server must be Docker Desktop, got ${JSON.stringify(info.OperatingSystem)}`,
		);
	}

	const target = `linux/${normalizeArchitecture(info.Architecture as string)}` as Target;

	const declared = env.DOCKER_DEFAULT_PLATFORM;
	if (declared !== undefined && declared !== "" && declared !== target) {
		dependency(
			"PLATFORM",
			`DOCKER_DEFAULT_PLATFORM=${declared} conflicts with the native target ${target}`,
		);
	}

	return target;
};

/** Reject any request for a target the engine does not natively provide. */
export const requireNative = (target: Target, required: string | undefined): void => {
	if (required === undefined || required === "") return;
	if (!TARGETS.includes(required as Target)) {
		dependency("PLATFORM", `unsupported required platform ${JSON.stringify(required)}`);
	}
	if (required !== target) {
		dependency(
			"PLATFORM",
			`required platform ${required} is not the native engine target ${target}; emulation is not supported`,
		);
	}
};

// --- bounded execution ----------------------------------------------------

export type CommandResult = {
	code: number | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
};

export type CommandRunner = (
	argv: string[],
	timeoutSeconds: number,
) => Promise<CommandResult>;

/**
 * Run a Docker CLI command in its own process group under a wall-clock bound.
 * At timeout: SIGTERM to the group, wait the pinned grace, then SIGKILL.
 */
export const makeRunner = (graceSeconds: number): CommandRunner => {
	return (argv, timeoutSeconds) =>
		new Promise<CommandResult>((resolve) => {
			const child = spawn(argv[0], argv.slice(1), {
				detached: true,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";
			let timedOut = false;
			let settled = false;
			let killTimer: ReturnType<typeof setTimeout> | undefined;

			child.stdout?.on("data", (chunk) => {
				stdout += String(chunk);
			});
			child.stderr?.on("data", (chunk) => {
				stderr += String(chunk);
			});

			const signalGroup = (signal: NodeJS.Signals): void => {
				if (child.pid === undefined) return;
				try {
					process.kill(-child.pid, signal);
				} catch {
					try {
						child.kill(signal);
					} catch {
						// The process group is already gone.
					}
				}
			};

			const timer = setTimeout(() => {
				timedOut = true;
				signalGroup("SIGTERM");
				killTimer = setTimeout(() => signalGroup("SIGKILL"), graceSeconds * 1000);
			}, timeoutSeconds * 1000);

			const settle = (code: number | null): void => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				if (killTimer !== undefined) clearTimeout(killTimer);
				resolve({ code, stdout, stderr, timedOut });
			};

			child.on("error", () => settle(null));
			child.on("close", (code) => settle(code));
		});
};

/** Allocate the exact container name shape the Docker boundary requires. */
export const containerName = (): string =>
	`structurizr-${randomBytes(16).toString("hex")}`;

export const CONTAINER_NAME_PATTERN = /^structurizr-[0-9a-f]{32}$/;

// --- image inspection -----------------------------------------------------

export type ImageInspect = {
	Os?: unknown;
	Architecture?: unknown;
	RepoDigests?: unknown;
	Config?: { Entrypoint?: unknown; Env?: unknown };
};

/** Verify the pulled image really is the pinned image with the pinned interface. */
export const verifyImage = (options: {
	inspect: ImageInspect;
	pin: StructurizrPin;
	target: Target;
}): void => {
	const { inspect, pin, target } = options;
	const [, expectedArch] = target.split("/");

	if (inspect.Os !== "linux" || inspect.Architecture !== expectedArch) {
		dependency(
			"PLATFORM",
			`image reports ${String(inspect.Os)}/${String(inspect.Architecture)}, expected ${target}`,
		);
	}

	const digests = Array.isArray(inspect.RepoDigests) ? inspect.RepoDigests : [];
	const wanted = `${pin.image.repository}@${pin.image.indexDigest}`;
	if (!digests.includes(wanted)) {
		dependency(
			"IMAGE",
			`image does not carry the pinned repo digest ${wanted}`,
		);
	}

	const entrypoint = inspect.Config?.Entrypoint;
	if (
		!Array.isArray(entrypoint) ||
		entrypoint.length !== pin.image.entrypoint.length ||
		entrypoint.some((item, index) => item !== pin.image.entrypoint[index])
	) {
		dependency(
			"IMAGE",
			`image entrypoint ${JSON.stringify(entrypoint)} is not the pinned ${JSON.stringify(pin.image.entrypoint)}`,
		);
	}

	const env = inspect.Config?.Env;
	if (!Array.isArray(env)) {
		dependency("IMAGE", "image config environment is not an array");
	}
	for (const entry of env as unknown[]) {
		if (typeof entry !== "string" || !entry.includes("=")) {
			dependency("IMAGE", `malformed image environment entry ${JSON.stringify(entry)}`);
		}
		const name = (entry as string).slice(0, (entry as string).indexOf("="));
		if (!pin.image.allowedEnvironmentNames.includes(name)) {
			dependency("IMAGE", `image config carries unexpected environment name ${name}`);
		}
	}
};

/** The container platform probe must independently agree with the selected target. */
export const verifyContainerPlatform = (stdout: string, target: Target): void => {
	const observed = stdout.trim();
	if (observed !== EXPECTED_UNAME[target]) {
		dependency(
			"PLATFORM",
			`in-container probe reported ${JSON.stringify(observed)}, expected ${JSON.stringify(EXPECTED_UNAME[target])} for ${target}`,
		);
	}
};

/** `version` must report exactly the pinned application and library versions. */
export const verifyVersion = (stdout: string, pin: StructurizrPin): void => {
	const application = `structurizr: ${pin.upstream.applicationVersion}`;
	const libraries = `structurizr-*: ${pin.upstream.librariesVersion}`;
	if (!stdout.includes(application)) {
		dependency("IMAGE", `version output does not report ${application}`);
	}
	if (!stdout.includes(libraries)) {
		dependency("IMAGE", `version output does not report ${libraries}`);
	}
};

// --- the probe sequence ---------------------------------------------------

export type ProbeStage =
	| "dockerInfo"
	| "indexInspect"
	| "pull"
	| "imageInspect"
	| "platformProbe"
	| "version"
	| "validate"
	| "jsonExport"
	| "svgExport";

/** Map a stage to the exact code its failure and timeout carry. */
export const stageFailure = (
	stage: ProbeStage,
	timedOut: boolean,
): { errorClass: ProbeErrorClass; code: string } => {
	if (stage === "dockerInfo") return { errorClass: "DEPENDENCY", code: "DOCKER" };
	if (stage === "indexInspect" || stage === "pull" || stage === "imageInspect") {
		return { errorClass: "DEPENDENCY", code: "IMAGE" };
	}
	if (stage === "platformProbe") return { errorClass: "DEPENDENCY", code: "PLATFORM" };
	if (stage === "version") return { errorClass: "DEPENDENCY", code: "IMAGE" };
	if (stage === "validate") {
		return { errorClass: "VALIDATION", code: timedOut ? "TIMEOUT" : "DSL" };
	}
	if (stage === "jsonExport") {
		return { errorClass: "RENDER", code: timedOut ? "TIMEOUT" : "JSON" };
	}
	return { errorClass: "RENDER", code: timedOut ? "TIMEOUT" : "SVG" };
};

const raiseStage = (stage: ProbeStage, result: CommandResult): never => {
	const { errorClass, code } = stageFailure(stage, result.timedOut);
	const reason = result.timedOut
		? `${stage} exceeded its wall-clock bound`
		: `${stage} exited ${String(result.code)}`;
	const tail = result.stderr.trim().split("\n").slice(-2).join(" ").slice(0, 400);
	throw new StructurizrProbeError(
		errorClass,
		code,
		tail.length > 0 ? `${reason}: ${tail}` : reason,
	);
};

export type ProbeOptions = {
	fixture: string;
	outputDir: string;
	pin?: StructurizrPin;
	run: CommandRunner;
	hostOs: string;
	env: Record<string, string | undefined>;
	requireNative?: string;
	name?: () => string;
};

export type ProbeReport = {
	target: Target;
	containerNames: string[];
	versionStdout: string;
	platformProbeStdout: string;
};

/**
 * Execute the full bounded probe. Every image operation passes the resolved platform
 * explicitly; no cross-target request is ever made.
 */
export const probe = async (options: ProbeOptions): Promise<ProbeReport> => {
	const pin = options.pin ?? loadPin();
	const timeouts = pin.timeoutsSeconds;
	const nameFor = options.name ?? containerName;
	const reference = pin.image.reference;
	const containerNames: string[] = [];

	const step = async (
		stage: ProbeStage,
		argv: string[],
		timeoutSeconds: number,
	): Promise<CommandResult> => {
		const result = await options.run(argv, timeoutSeconds);
		if (result.timedOut || result.code !== 0) raiseStage(stage, result);
		return result;
	};

	// 1. The Docker server is the authority for the OCI target.
	const info = await step(
		"dockerInfo",
		["docker", "info", "--format", "{{json .}}"],
		timeouts.dockerInfo,
	);
	let parsedInfo: DockerInfo;
	try {
		parsedInfo = JSON.parse(info.stdout);
	} catch {
		return dependency("DOCKER", "docker info did not return JSON");
	}

	const target = resolveTarget({
		info: parsedInfo,
		hostOs: options.hostOs,
		env: options.env,
	});
	requireNative(target, options.requireNative);

	// 2. Index and image, always with an explicit platform.
	await step(
		"indexInspect",
		["docker", "manifest", "inspect", reference],
		timeouts.indexInspect,
	);
	await step(
		"pull",
		["docker", "pull", "--platform", target, reference],
		timeouts.pull,
	);
	const inspected = await step(
		"imageInspect",
		["docker", "image", "inspect", reference, "--format", "{{json .}}"],
		timeouts.imageInspect,
	);
	let imageInspect: ImageInspect;
	try {
		imageInspect = JSON.parse(inspected.stdout);
	} catch {
		return dependency("IMAGE", "docker image inspect did not return JSON");
	}
	verifyImage({ inspect: imageInspect, pin, target });

	const baseArgs = (name: string): string[] => [
		"docker",
		"run",
		"--rm",
		"--name",
		name,
		"--platform",
		target,
		"--network=none",
		"--cap-drop=ALL",
		"--security-opt=no-new-privileges",
	];

	// 3. A separate fresh container proves the platform from inside.
	const probeName = nameFor();
	containerNames.push(probeName);
	const platformResult = await step(
		"platformProbe",
		[
			...baseArgs(probeName),
			"--entrypoint",
			pin.interface.platformProbeEntrypoint,
			reference,
			...pin.interface.platformProbe,
		],
		timeouts.platformProbe,
	);
	verifyContainerPlatform(platformResult.stdout, target);

	// 4. The pinned application command vectors, each in a fresh container.
	const versionName = nameFor();
	containerNames.push(versionName);
	const versionResult = await step(
		"version",
		[...baseArgs(versionName), reference, ...pin.interface.version],
		timeouts.version,
	);
	verifyVersion(versionResult.stdout + versionResult.stderr, pin);

	const modelMount = `${options.fixture}:/workspace/workspace.dsl:ro`;
	const outputMount = `${options.outputDir}:/output`;

	const validateName = nameFor();
	containerNames.push(validateName);
	await step(
		"validate",
		[
			...baseArgs(validateName),
			"-v",
			modelMount,
			reference,
			...pin.interface.validate,
		],
		timeouts.validate,
	);

	const jsonName = nameFor();
	containerNames.push(jsonName);
	await step(
		"jsonExport",
		[
			...baseArgs(jsonName),
			"-v",
			modelMount,
			"-v",
			outputMount,
			reference,
			...pin.interface.jsonExport,
		],
		timeouts.jsonExport,
	);

	const svgName = nameFor();
	containerNames.push(svgName);
	await step(
		"svgExport",
		[
			...baseArgs(svgName),
			"-v",
			modelMount,
			"-v",
			outputMount,
			reference,
			...pin.interface.svgExport,
		],
		timeouts.svgExport,
	);

	return {
		target,
		containerNames,
		versionStdout: versionResult.stdout,
		platformProbeStdout: platformResult.stdout,
	};
};

/** Force-remove a container by exact name under its own separate bound. */
export const forceRemove = async (
	run: CommandRunner,
	name: string,
	timeoutSeconds: number,
): Promise<CommandResult> => {
	if (!CONTAINER_NAME_PATTERN.test(name)) {
		return dependency("DOCKER", `refusing to remove non-generated name ${name}`);
	}
	return run(["docker", "rm", "-f", name], timeoutSeconds);
};

// --- CLI ------------------------------------------------------------------

const parseArgs = (argv: string[]): Record<string, string | boolean> => {
	const out: Record<string, string | boolean> = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg.startsWith("--")) continue;
		const key = arg.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith("--")) {
			out[key] = true;
		} else {
			out[key] = next;
			i += 1;
		}
	}
	return out;
};

if (import.meta.main) {
	const args = parseArgs(process.argv.slice(2));
	const pin = loadPin();

	if (args.live !== true) {
		console.error("CONFIG INVOCATION: structurizr-probe requires --live");
		process.exit(2);
	}
	const fixture = typeof args.fixture === "string" ? args.fixture : undefined;
	if (fixture === undefined) {
		console.error("CONFIG INVOCATION: --fixture <path> is required");
		process.exit(2);
	}
	const outputDir =
		typeof args.output === "string"
			? args.output
			: (process.env.TMPDIR ?? "/tmp").replace(/\/$/, "");

	const { platform } = await import("node:os");
	const hostOs = platform() === "darwin" ? "Darwin" : platform() === "linux" ? "Linux" : "other";

	try {
		const report = await probe({
			fixture,
			outputDir,
			pin,
			run: makeRunner(pin.timeoutsSeconds.terminateGrace),
			hostOs,
			env: process.env,
			requireNative:
				typeof args["require-native"] === "string"
					? (args["require-native"] as string)
					: undefined,
		});
		console.log(`structurizr-probe: native ${report.target} interface verified`);
		console.log(report.platformProbeStdout.trim());
		process.exit(0);
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
}
