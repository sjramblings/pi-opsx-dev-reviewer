/*
 * structurizr-docker.ts — the render path's Docker boundary.
 *
 * Runs via bun; not a pi extension.
 *
 * Every command runs in a fresh container with an exact generated name, with no network, no
 * capabilities, no privilege escalation, the host UID:GID, a read-only single-file model
 * mount, and a writable payload mount. The owner marker, stage parent, repository, model
 * directory, Docker socket, home, and credentials are never mounted.
 *
 * usage: import { renderInContainer } from "./structurizr-docker.ts"
 */

import { randomBytes } from "node:crypto";
import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { StructurizrPin } from "./structurizr-pin.ts";
import {
	type CommandResult,
	type CommandRunner,
	type Target,
	EXPECTED_UNAME,
} from "./structurizr-probe.ts";

export const CONTAINER_NAME_PATTERN = /^structurizr-[0-9a-f]{32}$/;

/** Runtime overrides. Nothing else is ever passed into a container. */
export const RUNTIME_ENVIRONMENT = ["HOME=/tmp", "TMPDIR=/tmp"];

/** Docker generates this; it is allowed but never set by us. */
export const GENERATED_ENVIRONMENT_NAMES = ["HOSTNAME"];

export type DockerErrorClass = "DEPENDENCY" | "VALIDATION" | "RENDER";

export class StructurizrDockerError extends Error {
	readonly errorClass: DockerErrorClass;
	readonly code: string;

	constructor(errorClass: DockerErrorClass, code: string, detail: string) {
		super(`${errorClass} ${code}: ${detail}`);
		this.errorClass = errorClass;
		this.code = code;
		this.name = "StructurizrDockerError";
	}
}

const fail = (errorClass: DockerErrorClass, code: string, detail: string): never => {
	throw new StructurizrDockerError(errorClass, code, detail);
};

/** Allocate the exact container name shape the boundary requires. */
export const allocateName = (): string =>
	`structurizr-${randomBytes(16).toString("hex")}`;

export type ContainerOptions = {
	name: string;
	target: Target;
	reference: string;
	uid: number;
	gid: number;
	/** Read-only single-file model mount, or undefined for commands with no model. */
	modelMount?: string;
	/** Writable payload mount, or undefined for commands producing no output. */
	payloadMount?: string;
	entrypoint?: string;
	args: string[];
};

/** Mount targets that would breach the boundary if they ever appeared. */
const FORBIDDEN_MOUNT_SOURCES = [
	"/var/run/docker.sock",
	"/run/docker.sock",
	"/root",
	"/home",
	"/.docker",
	"/.aws",
	"/.ssh",
];

const assertMountSafe = (mount: string): void => {
	const source = mount.split(":")[0];
	for (const forbidden of FORBIDDEN_MOUNT_SOURCES) {
		if (source === forbidden || source.startsWith(`${forbidden}/`)) {
			fail("DEPENDENCY", "DOCKER", `refusing to mount ${source}`);
		}
	}
	if (source.endsWith("/.docker") || source.endsWith("/.aws") || source.endsWith("/.ssh")) {
		fail("DEPENDENCY", "DOCKER", `refusing to mount ${source}`);
	}
};

/** Build the exact argv for one hardened, fresh container. */
export const buildRunArgv = (options: ContainerOptions): string[] => {
	if (!CONTAINER_NAME_PATTERN.test(options.name)) {
		fail("DEPENDENCY", "DOCKER", `container name ${options.name} is not the required shape`);
	}

	const argv = [
		"docker",
		"run",
		"--rm",
		"--name",
		options.name,
		"--platform",
		options.target,
		"--network=none",
		"--cap-drop=ALL",
		"--security-opt=no-new-privileges",
		"--user",
		`${options.uid}:${options.gid}`,
	];

	// Values are always attached; an unvalued --env would leak a host variable.
	for (const entry of RUNTIME_ENVIRONMENT) {
		argv.push("--env", entry);
	}

	if (options.modelMount !== undefined) {
		assertMountSafe(options.modelMount);
		if (!options.modelMount.endsWith(":ro")) {
			fail("DEPENDENCY", "DOCKER", "the model mount must be read-only");
		}
		argv.push("-v", options.modelMount);
	}
	if (options.payloadMount !== undefined) {
		assertMountSafe(options.payloadMount);
		const source = options.payloadMount.split(":")[0];
		if (!source.endsWith("/payload")) {
			fail("DEPENDENCY", "DOCKER", `only the payload directory may be writable, got ${source}`);
		}
		argv.push("-v", options.payloadMount);
	}
	if (options.entrypoint !== undefined) {
		argv.push("--entrypoint", options.entrypoint);
	}

	argv.push(options.reference, ...options.args);
	return argv;
};

/** Force-remove one exact generated container under its own separate bound. */
export const removeContainer = async (
	run: CommandRunner,
	name: string,
	timeoutSeconds: number,
): Promise<CommandResult> => {
	if (!CONTAINER_NAME_PATTERN.test(name)) {
		return fail("DEPENDENCY", "DOCKER", `refusing to remove non-generated name ${name}`);
	}
	return run(["docker", "rm", "-f", name], timeoutSeconds);
};

export type RenderStage = "platformProbe" | "version" | "validate" | "jsonExport" | "svgExport";

/** Map a render stage and outcome to its exact primary code. */
export const stageCode = (
	stage: RenderStage,
	timedOut: boolean,
): { errorClass: DockerErrorClass; code: string } => {
	switch (stage) {
		case "platformProbe":
			return { errorClass: "DEPENDENCY", code: "PLATFORM" };
		case "version":
			return { errorClass: "DEPENDENCY", code: "IMAGE" };
		case "validate":
			return { errorClass: "VALIDATION", code: timedOut ? "TIMEOUT" : "DSL" };
		case "jsonExport":
			return { errorClass: "RENDER", code: timedOut ? "TIMEOUT" : "JSON" };
		default:
			return { errorClass: "RENDER", code: timedOut ? "TIMEOUT" : "SVG" };
	}
};

export type RenderOptions = {
	pin: StructurizrPin;
	target: Target;
	modelMount: string;
	payloadDir: string;
	run: CommandRunner;
	uid: number;
	gid: number;
	name?: () => string;
};

export type RenderReport = {
	containerNames: string[];
	removedContainers: string[];
};

/** One regular workspace.json must exist before SVG export is attempted. */
const assertWorkspaceJson = (payloadDir: string): void => {
	const path = join(payloadDir, "workspace.json");
	let stats;
	try {
		stats = lstatSync(path);
	} catch {
		return fail("RENDER", "JSON", "JSON export produced no workspace.json");
	}
	if (stats.isSymbolicLink() || !stats.isFile()) {
		fail("RENDER", "JSON", "workspace.json is not a regular file");
	}
	if (stats.nlink !== 1) fail("RENDER", "JSON", "workspace.json has extra hard links");
};

/** Only key-derived regular SVG output may follow the export. */
const assertSvgOutput = (payloadDir: string): void => {
	for (const entry of readdirSync(payloadDir)) {
		if (entry === "workspace.json") continue;
		if (!entry.endsWith(".svg")) {
			fail("RENDER", "SVG", `unexpected non-SVG output ${entry}`);
		}
		const stats = lstatSync(join(payloadDir, entry));
		if (stats.isSymbolicLink() || !stats.isFile()) {
			fail("RENDER", "SVG", `${entry} is not a regular file`);
		}
	}
};

/**
 * Run the four pinned command vectors, each in its own fresh container, and force-remove
 * any container whose command timed out.
 */
export const renderInContainer = async (
	options: RenderOptions,
): Promise<RenderReport> => {
	const { pin, target, run } = options;
	const nameFor = options.name ?? allocateName;
	const timeouts = pin.timeoutsSeconds;
	const containerNames: string[] = [];
	const removedContainers: string[] = [];

	const step = async (
		stage: RenderStage,
		container: ContainerOptions,
		timeoutSeconds: number,
	): Promise<CommandResult> => {
		containerNames.push(container.name);
		const result = await run(buildRunArgv(container), timeoutSeconds);

		if (result.timedOut) {
			// The wrapper already sent TERM, waited the grace, then KILL. Removal is
			// separately bounded and targets only this exact generated name.
			await removeContainer(run, container.name, timeouts.forceRemove);
			removedContainers.push(container.name);
		}
		if (result.timedOut || result.code !== 0) {
			const { errorClass, code } = stageCode(stage, result.timedOut);
			const detail = result.timedOut
				? `${stage} exceeded its ${timeoutSeconds}-second bound`
				: `${stage} exited ${String(result.code)}: ${result.stderr.trim().slice(0, 300)}`;
			fail(errorClass, code, detail);
		}
		return result;
	};

	const base = {
		target,
		reference: pin.image.reference,
		uid: options.uid,
		gid: options.gid,
	};

	const probe = await step(
		"platformProbe",
		{
			...base,
			name: nameFor(),
			entrypoint: pin.interface.platformProbeEntrypoint,
			args: pin.interface.platformProbe,
		},
		timeouts.platformProbe,
	);
	if (probe.stdout.trim() !== EXPECTED_UNAME[target]) {
		fail(
			"DEPENDENCY",
			"PLATFORM",
			`in-container probe reported ${JSON.stringify(probe.stdout.trim())}, expected ${EXPECTED_UNAME[target]}`,
		);
	}

	const version = await step(
		"version",
		{ ...base, name: nameFor(), args: pin.interface.version },
		timeouts.version,
	);
	const versionText = version.stdout + version.stderr;
	if (
		!versionText.includes(`structurizr: ${pin.upstream.applicationVersion}`) ||
		!versionText.includes(`structurizr-*: ${pin.upstream.librariesVersion}`)
	) {
		fail("DEPENDENCY", "IMAGE", "version output does not report the pinned versions");
	}

	await step(
		"validate",
		{
			...base,
			name: nameFor(),
			modelMount: options.modelMount,
			args: pin.interface.validate,
		},
		timeouts.validate,
	);

	const payloadMount = `${options.payloadDir}:/output`;

	await step(
		"jsonExport",
		{
			...base,
			name: nameFor(),
			modelMount: options.modelMount,
			payloadMount,
			args: pin.interface.jsonExport,
		},
		timeouts.jsonExport,
	);
	assertWorkspaceJson(options.payloadDir);

	await step(
		"svgExport",
		{
			...base,
			name: nameFor(),
			modelMount: options.modelMount,
			payloadMount,
			args: pin.interface.svgExport,
		},
		timeouts.svgExport,
	);
	assertSvgOutput(options.payloadDir);

	return { containerNames, removedContainers };
};
