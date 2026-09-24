import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPin } from "./structurizr-pin.ts";
import {
	CONTAINER_NAME_PATTERN,
	type CommandResult,
	type CommandRunner,
	EXPECTED_UNAME,
	type ProbeStage,
	type Target,
	containerName,
	forceRemove,
	makeRunner,
	normalizeArchitecture,
	probe,
	requireNative,
	resolveTarget,
	stageFailure,
	verifyContainerPlatform,
	verifyImage,
	verifyVersion,
} from "./structurizr-probe.ts";

const pin = loadPin();

const workspace = mkdtempSync(join(tmpdir(), "structurizr-probe-"));
const fixture = join(workspace, "workspace.dsl");
writeFileSync(fixture, "workspace {}\n");
const outputDir = join(workspace, "payload");

const ok = (stdout = ""): CommandResult => ({
	code: 0,
	stdout,
	stderr: "",
	timedOut: false,
});

const healthyInfo = JSON.stringify({
	OSType: "linux",
	Architecture: "aarch64",
	OperatingSystem: "Docker Desktop",
	KernelVersion: "6.12.76-linuxkit",
});

const healthyInspect = (target: Target = "linux/arm64"): string =>
	JSON.stringify({
		Os: "linux",
		Architecture: target.split("/")[1],
		RepoDigests: [`${pin.image.repository}@${pin.image.indexDigest}`],
		Config: {
			Entrypoint: pin.image.entrypoint,
			Env: pin.image.allowedEnvironmentNames.map((name) => `${name}=value`),
		},
	});

const versionStdout = [
	`structurizr: ${pin.upstream.applicationVersion}`,
	`structurizr-*: ${pin.upstream.librariesVersion}`,
].join("\n");

/** Classify a docker argv into the probe stage it belongs to. */
const stageOf = (argv: string[]): ProbeStage => {
	if (argv[1] === "info") return "dockerInfo";
	if (argv[1] === "manifest") return "indexInspect";
	if (argv[1] === "pull") return "pull";
	if (argv[1] === "image") return "imageInspect";
	if (argv.includes("--entrypoint")) return "platformProbe";
	if (argv.includes("version")) return "version";
	if (argv.includes("validate")) return "validate";
	if (argv.includes("json")) return "jsonExport";
	return "svgExport";
};

type Override = Partial<Record<ProbeStage, CommandResult>>;

type Capture = { argv: string[]; timeout: number; stage: ProbeStage };

const fakeRunner = (
	overrides: Override = {},
	captures: Capture[] = [],
): CommandRunner => {
	return async (argv, timeout) => {
		const stage = stageOf(argv);
		captures.push({ argv, timeout, stage });
		if (overrides[stage] !== undefined) return overrides[stage] as CommandResult;
		if (stage === "dockerInfo") return ok(healthyInfo);
		if (stage === "imageInspect") return ok(healthyInspect());
		if (stage === "platformProbe") return ok(`${EXPECTED_UNAME["linux/arm64"]}\n`);
		if (stage === "version") return ok(versionStdout);
		return ok();
	};
};

const runProbe = (overrides: Override = {}, captures: Capture[] = []) =>
	probe({
		fixture,
		outputDir,
		pin,
		run: fakeRunner(overrides, captures),
		hostOs: "Darwin",
		env: {},
	});

const expectFailure = async (
	run: Promise<unknown>,
	expected: string,
): Promise<void> => {
	let message = "";
	try {
		await run;
		throw new Error("expected the probe to fail");
	} catch (error) {
		message = (error as Error).message;
	}
	expect(message.startsWith(expected)).toBe(true);
};

// --- the healthy path -----------------------------------------------------

test("a healthy native engine passes every pinned stage in order", async () => {
	const captures: Capture[] = [];
	const report = await runProbe({}, captures);

	expect(report.target).toBe("linux/arm64");
	expect(captures.map((c) => c.stage)).toEqual([
		"dockerInfo",
		"indexInspect",
		"pull",
		"imageInspect",
		"platformProbe",
		"version",
		"validate",
		"jsonExport",
		"svgExport",
	]);
});

test("every image operation carries the explicit resolved platform", async () => {
	const captures: Capture[] = [];
	await runProbe({}, captures);

	const platformBearing = captures.filter(
		(c) => c.stage !== "dockerInfo" && c.stage !== "indexInspect" && c.stage !== "imageInspect",
	);
	for (const capture of platformBearing) {
		const index = capture.argv.indexOf("--platform");
		expect(index).toBeGreaterThan(-1);
		expect(capture.argv[index + 1]).toBe("linux/arm64");
	}
});

test("each container is hardened and uniquely named", async () => {
	const captures: Capture[] = [];
	const report = await runProbe({}, captures);

	const runs = captures.filter((c) => c.argv[1] === "run");
	expect(runs).toHaveLength(5);
	for (const capture of runs) {
		expect(capture.argv).toContain("--network=none");
		expect(capture.argv).toContain("--cap-drop=ALL");
		expect(capture.argv).toContain("--security-opt=no-new-privileges");
		const name = capture.argv[capture.argv.indexOf("--name") + 1];
		expect(CONTAINER_NAME_PATTERN.test(name)).toBe(true);
	}
	expect(new Set(report.containerNames).size).toBe(report.containerNames.length);
});

test("the model is mounted read-only and the output mount is absent until export", async () => {
	const captures: Capture[] = [];
	await runProbe({}, captures);

	const validate = captures.find((c) => c.stage === "validate");
	expect(validate?.argv).toContain(`${fixture}:/workspace/workspace.dsl:ro`);
	expect(validate?.argv.join(" ")).not.toContain(`${outputDir}:/output`);

	const json = captures.find((c) => c.stage === "jsonExport");
	expect(json?.argv).toContain(`${outputDir}:/output`);
});

test("every stage uses its exact pinned wall-clock bound", async () => {
	const captures: Capture[] = [];
	await runProbe({}, captures);

	const byStage = Object.fromEntries(captures.map((c) => [c.stage, c.timeout]));
	expect(byStage.dockerInfo).toBe(60);
	expect(byStage.indexInspect).toBe(60);
	expect(byStage.pull).toBe(900);
	expect(byStage.imageInspect).toBe(60);
	expect(byStage.platformProbe).toBe(60);
	expect(byStage.version).toBe(60);
	expect(byStage.validate).toBe(60);
	expect(byStage.jsonExport).toBe(120);
	expect(byStage.svgExport).toBe(300);
});

// --- platform derivation --------------------------------------------------

test("server architectures normalize to the pinned OCI vocabulary", () => {
	expect(normalizeArchitecture("x86_64")).toBe("amd64");
	expect(normalizeArchitecture("amd64")).toBe("amd64");
	expect(normalizeArchitecture("aarch64")).toBe("arm64");
	expect(normalizeArchitecture("arm64")).toBe("arm64");
	expect(() => normalizeArchitecture("riscv64")).toThrow("DEPENDENCY PLATFORM");
});

test("Windows container mode is rejected", () => {
	expect(() =>
		resolveTarget({
			info: { OSType: "windows", Architecture: "amd64" },
			hostOs: "Linux",
			env: {},
		}),
	).toThrow("OSType must be linux");
});

test("a Darwin engine that is not Docker Desktop is rejected", () => {
	expect(() =>
		resolveTarget({
			info: { OSType: "linux", Architecture: "arm64", OperatingSystem: "Colima" },
			hostOs: "Darwin",
			env: {},
		}),
	).toThrow("must be Docker Desktop");
});

test("both Intel and Apple Silicon Docker Desktop are accepted", () => {
	expect(
		resolveTarget({
			info: { OSType: "linux", Architecture: "amd64", OperatingSystem: "Docker Desktop" },
			hostOs: "Darwin",
			env: {},
		}),
	).toBe("linux/amd64");
	expect(
		resolveTarget({
			info: { OSType: "linux", Architecture: "arm64", OperatingSystem: "Docker Desktop" },
			hostOs: "Darwin",
			env: {},
		}),
	).toBe("linux/arm64");
});

test("a conflicting DOCKER_DEFAULT_PLATFORM is rejected", () => {
	expect(() =>
		resolveTarget({
			info: { OSType: "linux", Architecture: "arm64", OperatingSystem: "Docker Desktop" },
			hostOs: "Darwin",
			env: { DOCKER_DEFAULT_PLATFORM: "linux/amd64" },
		}),
	).toThrow("conflicts with the native target linux/arm64");
});

test("an agreeing DOCKER_DEFAULT_PLATFORM is accepted", () => {
	expect(
		resolveTarget({
			info: { OSType: "linux", Architecture: "arm64", OperatingSystem: "Docker Desktop" },
			hostOs: "Darwin",
			env: { DOCKER_DEFAULT_PLATFORM: "linux/arm64" },
		}),
	).toBe("linux/arm64");
});

test("requesting a non-native target is rejected as emulation", () => {
	expect(() => requireNative("linux/arm64", "linux/amd64")).toThrow(
		"emulation is not supported",
	);
	expect(() => requireNative("linux/arm64", "linux/arm64")).not.toThrow();
	expect(() => requireNative("linux/arm64", "linux/riscv64")).toThrow(
		"unsupported required platform",
	);
});

test("an in-container platform mismatch is rejected", () => {
	// A QEMU or Rosetta path would surface here as the wrong machine string.
	expect(() => verifyContainerPlatform("Linux x86_64", "linux/arm64")).toThrow(
		"DEPENDENCY PLATFORM",
	);
	expect(() => verifyContainerPlatform("Linux aarch64", "linux/arm64")).not.toThrow();
});

test("the probe rejects an emulated in-container result end to end", async () => {
	await expectFailure(
		runProbe({ platformProbe: ok("Linux x86_64\n") }),
		"DEPENDENCY PLATFORM",
	);
});

// --- malformed shapes -----------------------------------------------------

test("docker info that is not JSON is DEPENDENCY DOCKER", async () => {
	await expectFailure(runProbe({ dockerInfo: ok("not json") }), "DEPENDENCY DOCKER");
});

test("docker info missing required fields is DEPENDENCY DOCKER", async () => {
	await expectFailure(
		runProbe({ dockerInfo: ok(JSON.stringify({ OSType: "linux" })) }),
		"DEPENDENCY DOCKER",
	);
});

test("an unavailable Docker CLI is DEPENDENCY DOCKER", async () => {
	await expectFailure(
		runProbe({ dockerInfo: { code: 127, stdout: "", stderr: "not found", timedOut: false } }),
		"DEPENDENCY DOCKER",
	);
});

test("an unavailable image is DEPENDENCY IMAGE", async () => {
	await expectFailure(
		runProbe({ pull: { code: 1, stdout: "", stderr: "manifest unknown", timedOut: false } }),
		"DEPENDENCY IMAGE",
	);
});

test("image inspect that is not JSON is DEPENDENCY IMAGE", async () => {
	await expectFailure(runProbe({ imageInspect: ok("<html>") }), "DEPENDENCY IMAGE");
});

test("a wrong repo digest, entrypoint, or image environment is rejected", () => {
	const base = JSON.parse(healthyInspect());

	expect(() =>
		verifyImage({
			inspect: { ...base, RepoDigests: ["structurizr/structurizr@sha256:" + "0".repeat(64)] },
			pin,
			target: "linux/arm64",
		}),
	).toThrow("pinned repo digest");

	expect(() =>
		verifyImage({
			inspect: { ...base, Config: { ...base.Config, Entrypoint: ["/bin/sh"] } },
			pin,
			target: "linux/arm64",
		}),
	).toThrow("is not the pinned");

	expect(() =>
		verifyImage({
			inspect: {
				...base,
				Config: { ...base.Config, Env: [...base.Config.Env, "AWS_SECRET_ACCESS_KEY=x"] },
			},
			pin,
			target: "linux/arm64",
		}),
	).toThrow("unexpected environment name AWS_SECRET_ACCESS_KEY");

	expect(() =>
		verifyImage({
			inspect: { ...base, Architecture: "amd64" },
			pin,
			target: "linux/arm64",
		}),
	).toThrow("DEPENDENCY PLATFORM");
});

test("a version response that does not report the pinned versions is rejected", () => {
	expect(() => verifyVersion("structurizr: 2026.05.22", pin)).toThrow("DEPENDENCY IMAGE");
	expect(() =>
		verifyVersion(`structurizr: ${pin.upstream.applicationVersion}`, pin),
	).toThrow("structurizr-*: 6.2.2");
	expect(() => verifyVersion(versionStdout, pin)).not.toThrow();
});

test("a malformed version response fails the probe", async () => {
	await expectFailure(runProbe({ version: ok("structurizr: 1.0.0") }), "DEPENDENCY IMAGE");
});

// --- stage failure taxonomy ----------------------------------------------

test("each stage maps to its exact primary code", () => {
	expect(stageFailure("dockerInfo", false)).toEqual({
		errorClass: "DEPENDENCY",
		code: "DOCKER",
	});
	expect(stageFailure("pull", false)).toEqual({ errorClass: "DEPENDENCY", code: "IMAGE" });
	expect(stageFailure("platformProbe", false)).toEqual({
		errorClass: "DEPENDENCY",
		code: "PLATFORM",
	});
	expect(stageFailure("validate", false)).toEqual({
		errorClass: "VALIDATION",
		code: "DSL",
	});
	expect(stageFailure("validate", true)).toEqual({
		errorClass: "VALIDATION",
		code: "TIMEOUT",
	});
	expect(stageFailure("jsonExport", false)).toEqual({ errorClass: "RENDER", code: "JSON" });
	expect(stageFailure("jsonExport", true)).toEqual({
		errorClass: "RENDER",
		code: "TIMEOUT",
	});
	expect(stageFailure("svgExport", false)).toEqual({ errorClass: "RENDER", code: "SVG" });
	expect(stageFailure("svgExport", true)).toEqual({ errorClass: "RENDER", code: "TIMEOUT" });
});

test("an invalid model fails validation, not render", async () => {
	await expectFailure(
		runProbe({
			validate: { code: 1, stdout: "", stderr: "expected: }", timedOut: false },
		}),
		"VALIDATION DSL",
	);
});

test("a failed JSON export is RENDER JSON and stops before SVG export", async () => {
	const captures: Capture[] = [];
	await expectFailure(
		runProbe(
			{ jsonExport: { code: 1, stdout: "", stderr: "export failed", timedOut: false } },
			captures,
		),
		"RENDER JSON",
	);
	expect(captures.some((c) => c.stage === "svgExport")).toBe(false);
});

// --- simulated hangs ------------------------------------------------------

const hang: CommandResult = { code: null, stdout: "", stderr: "", timedOut: true };

test("each simulated hang carries its stage timeout code", async () => {
	await expectFailure(runProbe({ pull: hang }), "DEPENDENCY IMAGE");
	await expectFailure(runProbe({ validate: hang }), "VALIDATION TIMEOUT");
	await expectFailure(runProbe({ jsonExport: hang }), "RENDER TIMEOUT");
	await expectFailure(runProbe({ svgExport: hang }), "RENDER TIMEOUT");
});

test("a hung stage stops the sequence immediately", async () => {
	const captures: Capture[] = [];
	await expectFailure(runProbe({ validate: hang }, captures), "VALIDATION TIMEOUT");
	expect(captures.map((c) => c.stage)).toEqual([
		"dockerInfo",
		"indexInspect",
		"pull",
		"imageInspect",
		"platformProbe",
		"version",
		"validate",
	]);
});

test("a real hung process is terminated at its bound and reported as timed out", async () => {
	const runner = makeRunner(1);
	const started = Date.now();
	const result = await runner(["sleep", "30"], 1);
	expect(result.timedOut).toBe(true);
	expect(Date.now() - started).toBeLessThan(15_000);
}, 20_000);

test("force-remove targets only an exact generated container name", async () => {
	const seen: string[][] = [];
	const runner: CommandRunner = async (argv) => {
		seen.push(argv);
		return ok();
	};
	const name = containerName();
	await forceRemove(runner, name, pin.timeoutsSeconds.forceRemove);
	expect(seen[0]).toEqual(["docker", "rm", "-f", name]);

	await expect(forceRemove(runner, "some-other-container", 30)).rejects.toThrow(
		"refusing to remove non-generated name",
	);
});

test("generated container names are unique per run", () => {
	const names = new Set(Array.from({ length: 64 }, () => containerName()));
	expect(names.size).toBe(64);
	for (const name of names) expect(CONTAINER_NAME_PATTERN.test(name)).toBe(true);
});
