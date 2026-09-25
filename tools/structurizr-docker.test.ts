import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPin } from "./structurizr-pin.ts";
import type { CommandResult, CommandRunner } from "./structurizr-probe.ts";
import { makeRunner } from "./structurizr-probe.ts";
import {
	CONTAINER_NAME_PATTERN,
	RUNTIME_ENVIRONMENT,
	StructurizrDockerError,
	allocateName,
	buildRunArgv,
	removeContainer,
	renderInContainer,
	stageCode,
} from "./structurizr-docker.ts";

const pin = loadPin();
const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const makePayload = (): string => {
	const stage = mkdtempSync(join(tmpdir(), "structurizr-docker-"));
	scratch.push(stage);
	const payload = join(stage, "payload");
	mkdirSync(payload);
	return payload;
};

const ok = (stdout = ""): CommandResult => ({ code: 0, stdout, stderr: "", timedOut: false });
const hung: CommandResult = { code: null, stdout: "", stderr: "", timedOut: true };

const versionText = [
	`structurizr: ${pin.upstream.applicationVersion}`,
	`structurizr-*: ${pin.upstream.librariesVersion}`,
].join("\n");

type Capture = { argv: string[]; timeout: number };

const stageOf = (argv: string[]): string => {
	if (argv[1] === "rm") return "remove";
	if (argv.includes("--entrypoint")) return "platformProbe";
	if (argv.includes("version")) return "version";
	if (argv.includes("validate")) return "validate";
	if (argv.includes("json")) return "jsonExport";
	return "svgExport";
};

/** A fake Docker that writes the files the real exporter would produce. */
const fakeDocker = (
	payload: string,
	captures: Capture[],
	overrides: Record<string, CommandResult> = {},
): CommandRunner => {
	return async (argv, timeout) => {
		captures.push({ argv, timeout });
		const stage = stageOf(argv);
		if (overrides[stage] !== undefined) return overrides[stage];

		if (stage === "platformProbe") return ok("Linux aarch64\n");
		if (stage === "version") return ok(versionText);
		if (stage === "jsonExport") {
			writeFileSync(join(payload, "workspace.json"), "{}");
			return ok();
		}
		if (stage === "svgExport") {
			for (const key of ["context", "container", "component"]) {
				writeFileSync(join(payload, `${key}.svg`), "<svg/>");
				writeFileSync(join(payload, `${key}-key.svg`), "<svg/>");
			}
			return ok();
		}
		return ok();
	};
};

const render = (payload: string, captures: Capture[], overrides = {}) =>
	renderInContainer({
		pin,
		target: "linux/arm64",
		modelMount: "/repo/docs/architecture/structurizr/workspace.dsl:/workspace/workspace.dsl:ro",
		payloadDir: payload,
		run: fakeDocker(payload, captures, overrides),
		uid: 501,
		gid: 20,
	});

const expectFailure = async (run: Promise<unknown>, expected: string): Promise<void> => {
	let message = "";
	try {
		await run;
		throw new Error(`expected ${expected}`);
	} catch (error) {
		expect(error).toBeInstanceOf(StructurizrDockerError);
		message = (error as Error).message;
	}
	expect(message.startsWith(expected)).toBe(true);
};

// --- argv shape -----------------------------------------------------------

test("every container is fresh, exactly named, and hardened", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	const report = await render(payload, captures);

	expect(report.containerNames).toHaveLength(5);
	for (const name of report.containerNames) {
		expect(CONTAINER_NAME_PATTERN.test(name)).toBe(true);
	}
	// Fresh means never reused.
	expect(new Set(report.containerNames).size).toBe(5);

	for (const capture of captures) {
		expect(capture.argv).toContain("--rm");
		expect(capture.argv).toContain("--network=none");
		expect(capture.argv).toContain("--cap-drop=ALL");
		expect(capture.argv).toContain("--security-opt=no-new-privileges");
		expect(capture.argv).toContain("--user");
		expect(capture.argv[capture.argv.indexOf("--user") + 1]).toBe("501:20");
		expect(capture.argv[capture.argv.indexOf("--platform") + 1]).toBe("linux/arm64");
	}
});

test("the four pinned command vectors are passed exactly", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	await render(payload, captures);

	const tail = (argv: string[]) => argv.slice(argv.indexOf(pin.image.reference) + 1);

	expect(tail(captures[0].argv)).toEqual(pin.interface.platformProbe);
	expect(tail(captures[1].argv)).toEqual(pin.interface.version);
	expect(tail(captures[2].argv)).toEqual(pin.interface.validate);
	expect(tail(captures[3].argv)).toEqual(pin.interface.jsonExport);
	expect(tail(captures[4].argv)).toEqual(pin.interface.svgExport);
});

test("only the model and payload are mounted, and only payload is writable", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	await render(payload, captures);

	for (const capture of captures) {
		const mounts = capture.argv
			.map((arg, i) => (arg === "-v" ? capture.argv[i + 1] : undefined))
			.filter((m): m is string => m !== undefined);

		for (const mount of mounts) {
			const [source, , mode] = mount.split(":");
			if (source.endsWith("workspace.dsl")) {
				expect(mode).toBe("ro");
			} else {
				expect(source.endsWith("/payload")).toBe(true);
			}
		}
		// The stage parent, owner marker, and repository are never mounted.
		expect(mounts.some((m) => m.split(":")[0].endsWith("/structurizr-docker"))).toBe(false);
		expect(mounts.some((m) => m.includes(".structurizr-owner.json"))).toBe(false);
	}
});

test("the Docker socket, home, and credentials can never be mounted", () => {
	for (const source of [
		"/var/run/docker.sock",
		"/run/docker.sock",
		"/root",
		"/home/user/.aws",
		"/Users/x/.ssh",
		"/Users/x/.docker",
	]) {
		expect(() =>
			buildRunArgv({
				name: allocateName(),
				target: "linux/arm64",
				reference: pin.image.reference,
				uid: 1,
				gid: 1,
				payloadMount: `${source}:/output`,
				args: ["version"],
			}),
		).toThrow("refusing to mount");
	}
});

test("a writable mount other than payload is refused", () => {
	expect(() =>
		buildRunArgv({
			name: allocateName(),
			target: "linux/arm64",
			reference: pin.image.reference,
			uid: 1,
			gid: 1,
			payloadMount: "/repo/docs:/output",
			args: ["version"],
		}),
	).toThrow("only the payload directory may be writable");
});

test("a read-write model mount is refused", () => {
	expect(() =>
		buildRunArgv({
			name: allocateName(),
			target: "linux/arm64",
			reference: pin.image.reference,
			uid: 1,
			gid: 1,
			modelMount: "/repo/workspace.dsl:/workspace/workspace.dsl",
			args: ["validate"],
		}),
	).toThrow("model mount must be read-only");
});

test("environment is closed and never passed unvalued", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	await render(payload, captures);

	for (const capture of captures) {
		const envValues = capture.argv
			.map((arg, i) => (arg === "--env" ? capture.argv[i + 1] : undefined))
			.filter((v): v is string => v !== undefined);

		expect(envValues).toEqual(RUNTIME_ENVIRONMENT);
		// Every --env carries a value, so no host variable is forwarded by name.
		for (const value of envValues) expect(value).toContain("=");
		for (const value of envValues) {
			const name = value.split("=")[0];
			expect(["HOME", "TMPDIR"]).toContain(name);
		}
	}
});

test("a container name outside the generated shape is refused", () => {
	expect(() =>
		buildRunArgv({
			name: "my-container",
			target: "linux/arm64",
			reference: pin.image.reference,
			uid: 1,
			gid: 1,
			args: ["version"],
		}),
	).toThrow("not the required shape");
});

// --- ordering and output --------------------------------------------------

test("workspace.json must exist before SVG export runs", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	// JSON export succeeds but writes nothing.
	await expectFailure(
		render(payload, captures, { jsonExport: ok() }),
		"RENDER JSON",
	);
	expect(captures.map((capture) => stageOf(capture.argv))).not.toContain("svgExport");
});

test("unexpected non-SVG output after export is rejected", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	const runner: CommandRunner = async (argv, timeout) => {
		captures.push({ argv, timeout });
		const stage = stageOf(argv);
		if (stage === "platformProbe") return ok("Linux aarch64\n");
		if (stage === "version") return ok(versionText);
		if (stage === "jsonExport") {
			writeFileSync(join(payload, "workspace.json"), "{}");
			return ok();
		}
		if (stage === "svgExport") {
			writeFileSync(join(payload, "context.svg"), "<svg/>");
			writeFileSync(join(payload, "context.png"), "not svg");
			return ok();
		}
		return ok();
	};

	await expectFailure(
		renderInContainer({
			pin,
			target: "linux/arm64",
			modelMount: "/repo/workspace.dsl:/workspace/workspace.dsl:ro",
			payloadDir: payload,
			run: runner,
			uid: 1,
			gid: 1,
		}),
		"RENDER SVG",
	);
});

// --- malformed responses --------------------------------------------------

test("a malformed platform probe or version response is rejected", async () => {
	const payloadA = makePayload();
	await expectFailure(
		render(payloadA, [], { platformProbe: ok("Linux x86_64\n") }),
		"DEPENDENCY PLATFORM",
	);

	const payloadB = makePayload();
	await expectFailure(
		render(payloadB, [], { version: ok("structurizr: 1.0.0") }),
		"DEPENDENCY IMAGE",
	);
});

test("each stage maps to its exact code", () => {
	expect(stageCode("platformProbe", false)).toEqual({
		errorClass: "DEPENDENCY",
		code: "PLATFORM",
	});
	expect(stageCode("validate", false)).toEqual({ errorClass: "VALIDATION", code: "DSL" });
	expect(stageCode("validate", true)).toEqual({ errorClass: "VALIDATION", code: "TIMEOUT" });
	expect(stageCode("jsonExport", false)).toEqual({ errorClass: "RENDER", code: "JSON" });
	expect(stageCode("svgExport", true)).toEqual({ errorClass: "RENDER", code: "TIMEOUT" });
});

// --- timeouts and removal -------------------------------------------------

test("every stage carries its exact pinned bound", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];
	await render(payload, captures);

	expect(captures[0].timeout).toBe(pin.timeoutsSeconds.platformProbe);
	expect(captures[1].timeout).toBe(pin.timeoutsSeconds.version);
	expect(captures[2].timeout).toBe(pin.timeoutsSeconds.validate);
	expect(captures[3].timeout).toBe(pin.timeoutsSeconds.jsonExport);
	expect(captures[4].timeout).toBe(pin.timeoutsSeconds.svgExport);
});

test("a hung stage force-removes only its own exact container", async () => {
	const payload = makePayload();
	const captures: Capture[] = [];

	await expectFailure(render(payload, captures, { validate: hung }), "VALIDATION TIMEOUT");

	const removal = captures.find((c) => c.argv[1] === "rm");
	expect(removal).toBeDefined();
	expect(removal?.timeout).toBe(pin.timeoutsSeconds.forceRemove);
	expect(removal?.argv.slice(0, 3)).toEqual(["docker", "rm", "-f"]);

	// The removed name is the validate container, not any other.
	const validateCapture = captures.find((c) => stageOf(c.argv) === "validate");
	const validateName = validateCapture?.argv[validateCapture.argv.indexOf("--name") + 1];
	expect(removal?.argv[3]).toBe(validateName);
	expect(CONTAINER_NAME_PATTERN.test(String(removal?.argv[3]))).toBe(true);
});

test("removal refuses a name outside the generated shape", async () => {
	const runner: CommandRunner = async () => ok();
	await expect(removeContainer(runner, "other-container", 30)).rejects.toThrow(
		"refusing to remove non-generated name",
	);
});

test("a real hung Docker process is terminated at its bound", async () => {
	// The wrapper sends TERM to the process group, waits the pinned grace, then KILL.
	const runner = makeRunner(pin.timeoutsSeconds.terminateGrace);
	const started = Date.now();
	const result = await runner(["sleep", "30"], 1);

	expect(result.timedOut).toBe(true);
	expect(Date.now() - started).toBeLessThan(20_000);
}, 30_000);

test("a repository checked out under /home (GitHub Linux runners) can mount its model", () => {
	const argv = buildRunArgv({
		name: allocateName(),
		target: "linux/amd64",
		reference: pin.image.reference,
		uid: 1,
		gid: 1,
		modelMount: "/home/runner/work/repo/repo/docs/architecture/structurizr/workspace.dsl:/workspace/workspace.dsl:ro",
		args: ["version"],
	});
	expect(argv).toContain("/home/runner/work/repo/repo/docs/architecture/structurizr/workspace.dsl:/workspace/workspace.dsl:ro");
});

test("a home directory itself, or anything under a credential directory, is still refused", () => {
	for (const source of ["/home", "/home/runner", "/root/x", "/home/runner/.ssh/id", "/home/runner/.aws/config", "/Users/x", "/home/runner/.config/gh/hosts.yml", "/home/runner/.gnupg"]) {
		expect(() =>
			buildRunArgv({
				name: allocateName(),
				target: "linux/arm64",
				reference: pin.image.reference,
				uid: 1,
				gid: 1,
				modelMount: `${source}:/workspace/workspace.dsl:ro`,
				args: ["version"],
			}),
		).toThrow("refusing to mount");
	}
});
