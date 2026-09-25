/*
 * structurizr-render.ts — compose source, lock, Docker, verifier, and manifest.
 *
 * Runs via bun; not a pi extension.
 *
 * One frozen precedence decides which failure is reported when several are latent. The
 * command stops at the first failure in that order, emits exactly one primary
 * "<CLASS> <CODE>:" line, and never publishes partial output or falls back to another
 * renderer.
 *
 * usage: bun tools/structurizr-render.ts [model]
 *        bun tools/structurizr-render.ts --clean
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadPin, type StructurizrPin } from "./structurizr-pin.ts";
import { resolveSource, gitRoot, modelMount } from "./structurizr-source.ts";
import {
	type CommandRunner,
	type Target,
	makeRunner,
	resolveTarget,
} from "./structurizr-probe.ts";
import { renderInContainer } from "./structurizr-docker.ts";
import {
	acquire,
	clean as cleanSession,
	createStage,
	discardStage,
	publish,
	removeSafeFinal,
	type Session,
} from "./structurizr-fs.ts";
import { serializeManifest, verifyOutput } from "./structurizr-verify.ts";

/**
 * The exact reporting precedence. Earlier entries win when several faults are latent, so
 * the reported code never depends on incidental discovery order.
 */
export const ERROR_PRECEDENCE: string[] = [
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
];

export class StructurizrInvocationError extends Error {
	readonly errorClass = "CONFIG";
	readonly code = "INVOCATION";

	constructor(detail: string) {
		super(`CONFIG INVOCATION: ${detail}`);
		this.name = "StructurizrInvocationError";
	}
}

/** Extract the "<CLASS> <CODE>" prefix from any taxonomy error. */
export const primaryCode = (error: unknown): string | undefined => {
	const message = (error as Error)?.message ?? "";
	const match = message.match(/^([A-Z]+) ([A-Z_]+):/);
	if (match === null) return undefined;
	const candidate = `${match[1]} ${match[2]}`;
	return ERROR_PRECEDENCE.includes(candidate) ? candidate : undefined;
};

/** Rank a code for precedence comparison; unknown codes sort last. */
export const precedenceOf = (code: string | undefined): number => {
	if (code === undefined) return Number.MAX_SAFE_INTEGER;
	const index = ERROR_PRECEDENCE.indexOf(code);
	return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

/** Of two latent faults, the earlier in the frozen order is the reported one. */
export const moreSevere = (a: unknown, b: unknown): unknown =>
	precedenceOf(primaryCode(a)) <= precedenceOf(primaryCode(b)) ? a : b;

export type RenderDeps = {
	run: CommandRunner;
	pin?: StructurizrPin;
	root?: string;
	uid?: number;
	gid?: number;
	bunVersion?: string;
	hostOs?: string;
	env?: Record<string, string | undefined>;
};

export type RenderOutcome = {
	target: Target;
	published: string;
	manifestPath: string;
	views: string[];
	secondary: string[];
};

const parseDockerInfo = (stdout: string): Record<string, unknown> => {
	try {
		return JSON.parse(stdout);
	} catch {
		throw new Error("DEPENDENCY DOCKER: docker info did not return JSON");
	}
};

/**
 * Run one complete render. Ordering IS the precedence: path establishment precedes the
 * lock, the lock precedes configuration, configuration precedes Docker, and publication
 * is last.
 */
export const render = async (
	options: { model?: string } & RenderDeps,
): Promise<RenderOutcome> => {
	const secondary: string[] = [];

	// 1. CONFIG INVOCATION — before any filesystem work.
	if (options.model !== undefined && typeof options.model !== "string") {
		throw new StructurizrInvocationError("model argument must be a string");
	}

	const root = options.root ?? gitRoot(process.cwd());

	// 2. IO PATH then IO LOCK_BUSY — establishment precedes acquisition.
	let session: Session = acquire({ root, command: "render" });

	try {
		// 3. IO UNSAFE_OUTPUT — a previous final root is removed only if entirely safe,
		//    so an ordinary later failure cannot leave a stale success behind.
		removeSafeFinal(session);

		// 4. CONFIG PIN, then the source codes.
		const pin = options.pin ?? loadPin();
		const source = resolveSource({ argument: options.model, root });

		// 5. DEPENDENCY BUN_VERSION before any Docker work.
		const bunVersion = options.bunVersion ?? Bun.version;
		if (bunVersion !== pin.bun.version) {
			throw new Error(
				`DEPENDENCY BUN_VERSION: bun ${bunVersion} is not the pinned ${pin.bun.version}`,
			);
		}

		// 6. DEPENDENCY DOCKER / PLATFORM.
		const info = await options.run(
			["docker", "info", "--format", "{{json .}}"],
			pin.timeoutsSeconds.dockerInfo,
		);
		if (info.timedOut || info.code !== 0) {
			throw new Error("DEPENDENCY DOCKER: docker info failed");
		}
		const target = resolveTarget({
			info: parseDockerInfo(info.stdout),
			hostOs: options.hostOs ?? "Darwin",
			env: options.env ?? {},
		});

		createStage(session);

		// 7. VALIDATION then RENDER, inside the hardened containers.
		await renderInContainer({
			pin,
			target,
			modelMount: modelMount(source),
			payloadDir: session.payloadPath,
			run: options.run,
			uid: options.uid ?? process.getuid?.() ?? 0,
			gid: options.gid ?? process.getgid?.() ?? 0,
		});

		// 8. CONSISTENCY — nothing is published until every layer passes.
		const verified = verifyOutput({
			directory: session.payloadPath,
			source: { path: source.relativePath, sha256: source.sha256 },
			pin,
			platform: target,
		});

		writeFileSync(
			join(session.payloadPath, "manifest.json"),
			serializeManifest(verified.manifest),
		);

		// 9. IO PUBLISH — atomic, last.
		publish(session);

		try {
			discardStage(session);
		} catch (error) {
			// Cleanup failures never displace the primary outcome.
			secondary.push((error as Error).message);
		}

		return {
			target,
			published: session.finalPath,
			manifestPath: join(session.finalPath, "manifest.json"),
			views: verified.workspace.views.map((view) => view.key),
			secondary,
		};
	} catch (primary) {
		// A failed run removes only its own stage; anything unowned is retained.
		try {
			discardStage(session);
		} catch (cleanupError) {
			// IO CLEANUP is last in precedence, so it never displaces the primary.
			throw moreSevere(primary, cleanupError);
		}
		throw primary;
	} finally {
		session.release();
	}
};

/** Run one clean under the same lock. */
export const clean = (options: { root?: string } = {}) => {
	const root = options.root ?? gitRoot(process.cwd());
	const session = acquire({ root, command: "clean" });
	try {
		return cleanSession(session);
	} finally {
		session.release();
	}
};

// --- CLI ------------------------------------------------------------------

if (import.meta.main) {
	const args = process.argv.slice(2);
	const wantsClean = args.includes("--clean");
	const positional = args.filter((arg) => !arg.startsWith("--"));

	try {
		if (wantsClean) {
			if (positional.length > 0) {
				throw new StructurizrInvocationError("--clean takes no model argument");
			}
			const report = clean();
			console.log(
				`structurizr-clean: final ${report.removedFinal ? "removed" : "absent"}, ` +
					`${report.removedStages.length} owned stage(s) removed, ` +
					`${report.retainedStages.length} retained`,
			);
			for (const retained of report.retainedStages) {
				console.log(`  retained (recover manually): ${retained}`);
			}
			process.exit(0);
		}

		if (positional.length > 1) {
			throw new StructurizrInvocationError("at most one model argument is accepted");
		}

		const pin = loadPin();
		const { platform } = await import("node:os");
		const outcome = await render({
			model: positional[0],
			run: makeRunner(pin.timeoutsSeconds.terminateGrace),
			pin,
			hostOs: platform() === "darwin" ? "Darwin" : platform() === "linux" ? "Linux" : "other",
			env: process.env,
		});

		console.log(`structurizr-render: published ${outcome.published} (${outcome.target})`);
		console.log(`  views: ${outcome.views.join(", ")}`);
		for (const note of outcome.secondary) console.log(`  secondary: ${note}`);
		process.exit(0);
	} catch (error) {
		// Exactly one primary line.
		console.error((error as Error).message);
		process.exit(1);
	}
}
