/*
 * structurizr-dogfood.test.ts — this repository renders its own model.
 *
 * Two ways to run:
 *
 *   bun test tools/structurizr-dogfood.test.ts
 *     Offline assertions about the opted-in state of this repository.
 *
 *   bun tools/structurizr-dogfood.test.ts --require-native linux/amd64
 *     The live dogfood. Refuses any engine that is not the required native target,
 *     performs one real pinned render, independently rechecks every manifest size and
 *     hash and every safety and lineage invariant, then proves that a post-success
 *     invalid-model run publishes nothing and leaves no owned stage.
 *
 * No two-render byte comparison is made and no stable SVG hash is claimed.
 */

import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	lstatSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadPin } from "./structurizr-pin.ts";
import { makeRunner, resolveTarget, type Target } from "./structurizr-probe.ts";
import { CANONICAL_MODEL_PATH } from "./structurizr-source.ts";
import { FINAL_NAME, STAGE_PREFIX, LOCK_NAME } from "./structurizr-fs.ts";
import {
	parseManifest,
	parseWorkspace,
	verifyLineage,
	verifyManifestAgainstDirectory,
	verifySvgFile,
	verifyViewKeys,
} from "./structurizr-verify.ts";

const repoRoot = join(import.meta.dir, "..");
const modelPath = join(repoRoot, ...CANONICAL_MODEL_PATH.split("/"));
const lockParent = join(repoRoot, "build", "architecture");
const finalRoot = join(lockParent, FINAL_NAME);

// --- offline: this repository is opted in ---------------------------------
//
// `import.meta.main` is true under `bun test` as well, so the live dogfood is selected by
// its own flag instead. Without --require-native this file is an ordinary test file.

const LIVE = process.argv.includes("--require-native");

if (!LIVE) {
test("this repository carries its own team-owned model", () => {
	expect(existsSync(modelPath)).toBe(true);
	const model = readFileSync(modelPath, "utf8");
	expect(model).toContain("!identifiers hierarchical");
	expect(model).toContain('"context"');
	expect(model).toContain('"container"');
	expect(model).toContain('"component"');
	// A relationship reaches a component directly, so lineage survives all three views.
	expect(/->\s+[\w.]+\.[\w]+\.[\w]+/.test(model)).toBe(true);
});

test("the opt-in inventory and immutable workflow are installed", () => {
	for (const relative of [
		"justfile.structurizr",
		"tools/structurizr/pin.json",
		"tools/vendor/structurizr-xml/NOTICE.md",
		".github/workflows/structurizr.yml",
	]) {
		expect(existsSync(join(repoRoot, relative))).toBe(true);
	}
	const workflow = readFileSync(join(repoRoot, ".github/workflows/structurizr.yml"), "utf8");
	expect(workflow).toContain("ubuntu-24.04");
	expect(workflow).toContain("contents: read");
});

test("generated output is ignored and never tracked", () => {
	const tracked = execFileSync("git", ["ls-files", "build/architecture/structurizr"], {
		cwd: repoRoot,
		encoding: "utf8",
	}).trim();
	expect(tracked).toBe("");

	const ignored = execFileSync(
		"git",
		["check-ignore", "build/architecture/structurizr/manifest.json"],
		{ cwd: repoRoot, encoding: "utf8" },
	).trim();
	expect(ignored).not.toBe("");
});

test("no owned stage or lock is left behind from earlier runs", () => {
	if (!existsSync(lockParent)) return;
	expect(existsSync(join(lockParent, LOCK_NAME))).toBe(false);
	expect(readdirSync(lockParent).filter((e) => e.startsWith(STAGE_PREFIX))).toEqual([]);
});

} // end offline test registrations

// --- the live dogfood -----------------------------------------------------

const fail = (message: string): never => {
	console.error(message);
	process.exit(1);
};

/** Independently recheck everything the render already claimed. */
const recheckPublished = (directory: string, platform: Target): void => {
	const manifest = parseManifest(
		readFileSync(join(directory, "manifest.json"), "utf8"),
	);

	if (manifest.schemaVersion !== 1) fail("dogfood: manifest is not schema version 1");
	if (manifest.image.platform !== platform) {
		fail(`dogfood: manifest platform ${manifest.image.platform} is not ${platform}`);
	}

	const pin = loadPin();
	if (manifest.image.reference !== pin.image.reference) {
		fail("dogfood: manifest image reference is not the pinned reference");
	}
	if (manifest.bun.version !== pin.bun.version) {
		fail("dogfood: manifest bun version is not the pinned version");
	}

	// Every size and hash, recomputed from the published bytes.
	verifyManifestAgainstDirectory(manifest, directory);
	for (const file of manifest.files) {
		const bytes = readFileSync(join(directory, file.path));
		if (bytes.byteLength !== file.bytes) fail(`dogfood: ${file.path} size drift`);
		if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
			fail(`dogfood: ${file.path} hash drift`);
		}
		const stats = lstatSync(join(directory, file.path));
		if (stats.isSymbolicLink() || !stats.isFile() || stats.nlink !== 1) {
			fail(`dogfood: ${file.path} is not a single-link regular file`);
		}
	}

	// Lineage, view keys, and passive-SVG safety, checked again from scratch.
	const workspace = parseWorkspace(readFileSync(join(directory, "workspace.json"), "utf8"));
	verifyViewKeys(workspace.views);
	verifyLineage(workspace);
	for (const name of readdirSync(directory)) {
		if (name.endsWith(".svg")) verifySvgFile(join(directory, name));
	}
};

if (LIVE) {
	const args = process.argv.slice(2);
	const index = args.indexOf("--require-native");
	const required = index === -1 ? undefined : args[index + 1];
	if (required === undefined) {
		fail("dogfood: --require-native <linux/amd64|linux/arm64> is required");
	}

	const pin = loadPin();
	const run = makeRunner(pin.timeoutsSeconds.terminateGrace);

	const info = await run(["docker", "info", "--format", "{{json .}}"], pin.timeoutsSeconds.dockerInfo);
	if (info.timedOut || info.code !== 0) fail("DEPENDENCY DOCKER: docker info failed");

	const { platform } = await import("node:os");
	const target = resolveTarget({
		info: JSON.parse(info.stdout),
		hostOs: platform() === "darwin" ? "Darwin" : "Linux",
		env: process.env,
	});

	// Refuse a non-native engine outright; emulation is never acceptable evidence.
	if (target !== required) {
		fail(
			`DEPENDENCY PLATFORM: required ${required} but this engine is native ${target}; emulation is not supported`,
		);
	}

	const { render } = await import("./structurizr-render.ts");
	const outcome = await render({
		root: repoRoot,
		pin,
		run,
		bunVersion: pin.bun.version,
		hostOs: platform() === "darwin" ? "Darwin" : "Linux",
		env: process.env,
	});
	console.log(`dogfood: rendered ${outcome.views.join(", ")} on native ${target}`);

	recheckPublished(finalRoot, target);
	console.log("dogfood: manifest, lineage, view keys, and SVG safety independently rechecked");

	// After success, an invalid model must publish nothing and leave no owned stage.
	const backup = readFileSync(modelPath);
	writeFileSync(
		modelPath,
		'workspace "Broken" {\n    model {\n        a = person "A"\n    }\n    views {\n        systemContext nosuchsystem "context" { include * }\n    }\n}\n',
	);
	let primary = "";
	try {
		await render({
			root: repoRoot,
			pin,
			run,
			bunVersion: pin.bun.version,
			hostOs: platform() === "darwin" ? "Darwin" : "Linux",
			env: process.env,
		});
	} catch (error) {
		primary = (error as Error).message.split("\n")[0];
	} finally {
		writeFileSync(modelPath, backup);
	}

	if (!primary.startsWith("VALIDATION ")) {
		fail(`dogfood: expected a VALIDATION failure, got ${JSON.stringify(primary)}`);
	}
	if (existsSync(finalRoot)) fail("dogfood: the failed run left a published root");
	if (readdirSync(lockParent).some((e) => e.startsWith(STAGE_PREFIX))) {
		fail("dogfood: the failed run left an owned stage");
	}
	if (existsSync(join(lockParent, LOCK_NAME))) fail("dogfood: the failed run left a lock");

	console.log(`dogfood: post-success invalid model -> ${primary}; nothing published`);
	console.log("dogfood: PASS (no byte comparison made; SVG hashes are not a stable API)");
	process.exit(0);
}
