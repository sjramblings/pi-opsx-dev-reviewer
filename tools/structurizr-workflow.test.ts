import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadPin } from "./structurizr-pin.ts";

const pin = loadPin();
const workflowPath = join(
	import.meta.dir,
	"..",
	"templates",
	"structurizr",
	"structurizr.yml",
);
const text = readFileSync(workflowPath, "utf8");
const workflow = Bun.YAML.parse(text) as any;

const renderJob = workflow.jobs.render;
const steps: any[] = renderJob.steps;
const stepUsing = (needle: string) =>
	steps.find((step) => typeof step.uses === "string" && step.uses.includes(needle));
const stepNamed = (name: string) => steps.find((step) => step.name === name);

// --- triggers and filters -------------------------------------------------

test("the workflow triggers on pull request, push to main, and manual dispatch", () => {
	const on = workflow.on ?? workflow[true];
	expect(Object.keys(on).sort()).toEqual(["pull_request", "push", "workflow_dispatch"]);
	expect(on.push.branches).toEqual(["main"]);
});

test("the model filter is the exact path with no includes glob", () => {
	const on = workflow.on ?? workflow[true];
	for (const trigger of [on.pull_request, on.push]) {
		expect(trigger.paths).toContain("docs/architecture/structurizr/workspace.dsl");
		// An includes glob would widen the trigger to files the model may not include.
		const modelGlobs = trigger.paths.filter(
			(path: string) =>
				path.startsWith("docs/architecture/structurizr/") && path.includes("*"),
		);
		expect(modelGlobs).toEqual([]);
	}
});

test("the filters cover tools, pin, recipes, installer, templates, and the workflow", () => {
	const on = workflow.on ?? workflow[true];
	for (const required of [
		"tools/structurizr/**",
		"tools/vendor/structurizr-xml/**",
		"tools/structurizr-render.ts",
		"tools/structurizr-verify.ts",
		"justfile.structurizr",
		"install.sh",
		"templates/structurizr/**",
		".github/workflows/structurizr.yml",
	]) {
		expect(on.pull_request.paths).toContain(required);
		expect(on.push.paths).toContain(required);
	}
});

// --- runner and permissions ----------------------------------------------

test("the job runs on the canonical native runner", () => {
	expect(renderJob["runs-on"]).toBe("ubuntu-24.04");
	expect(renderJob.name).toBe("native-amd64");
});

test("only contents read is granted", () => {
	expect(workflow.permissions).toEqual({ contents: "read" });
	expect(renderJob.permissions).toBeUndefined();
});

test("no write permission, secret, OIDC, package, or pull_request_target appears", () => {
	for (const forbidden of [
		"pull_request_target",
		"secrets.",
		"id-token",
		"packages:",
		"contents: write",
		"github.token",
		"GITHUB_TOKEN",
	]) {
		expect(text).not.toContain(forbidden);
	}
});

// --- pinned actions -------------------------------------------------------

test("every action is pinned to a commit", () => {
	const uses = steps
		.map((step) => step.uses)
		.filter((value): value is string => typeof value === "string");
	expect(uses).toHaveLength(3);
	for (const value of uses) {
		expect(/@[0-9a-f]{40}$/.test(value)).toBe(true);
	}
});

test("checkout, setup-bun, and upload carry the specified commits", () => {
	expect(stepUsing("actions/checkout").uses).toBe(
		"actions/checkout@08c6903cd8c0fde910a37f88322edcfb5dd907a8",
	);
	expect(stepUsing("oven-sh/setup-bun").uses).toBe(pin.bun.setupAction);
	expect(stepUsing("actions/upload-artifact").uses).toBe(
		"actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
	);
});

test("checkout does not persist credentials", () => {
	expect(stepUsing("actions/checkout").with["persist-credentials"]).toBe(false);
});

test("setup-bun installs the pinned version", () => {
	expect(String(stepUsing("oven-sh/setup-bun").with["bun-version"])).toBe(pin.bun.version);
});

// --- Bun provenance -------------------------------------------------------

test("Bun release URL, archive hash, executable hash, and version are checked", () => {
	const step = stepNamed("Verify Bun provenance").run as string;
	expect(step).toContain(pin.bun.archives["linux-x64"].url);
	expect(step).toContain(pin.bun.archives["linux-x64"].sha256);
	expect(step).toContain(pin.bun.ciExecutableSha256);
	expect(step).toContain("bun --version");
	expect(step).toContain("sha256sum -c -");
});

test("the native engine is verified before any platform export", () => {
	const engineIndex = steps.indexOf(stepNamed("Verify native engine before any platform export"));
	const renderIndex = steps.indexOf(stepNamed("Render"));
	expect(engineIndex).toBeGreaterThan(-1);
	expect(engineIndex).toBeLessThan(renderIndex);

	const engineStep = steps[engineIndex].run as string;
	expect(engineStep).toContain("docker info");
	expect(engineStep).toContain("DEPENDENCY PLATFORM");
	expect(engineStep).toContain("emulation is not supported");

	// DOCKER_DEFAULT_PLATFORM is not set before server equality has passed.
	const before = steps
		.slice(0, engineIndex)
		.map((step) => JSON.stringify(step))
		.join("\n");
	expect(before).not.toContain("DOCKER_DEFAULT_PLATFORM");
});

// --- scrubbed render environment -----------------------------------------

test("the render subprocess starts from an empty environment with exactly six names", () => {
	const step = stepNamed("Render").run as string;
	expect(step).toContain("env -i");

	const assigned = [...step.matchAll(/^\s*([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]);
	const inEnv = assigned.filter((name) =>
		["PATH", "HOME", "TMPDIR", "CI", "DOCKER_DEFAULT_PLATFORM", "BUN_CONFIG_NO_TELEMETRY"].includes(
			name,
		),
	);
	expect(new Set(inEnv)).toEqual(
		new Set([
			"PATH",
			"HOME",
			"TMPDIR",
			"CI",
			"DOCKER_DEFAULT_PLATFORM",
			"BUN_CONFIG_NO_TELEMETRY",
		]),
	);

	// HOME and TMPDIR are fresh job-temporary directories, not the runner home.
	expect(step).toContain("job_home=$(mktemp -d)");
	expect(step).toContain("job_tmp=$(mktemp -d)");
	expect(step).toContain("DOCKER_DEFAULT_PLATFORM=linux/amd64");
});

test("no GitHub value is forwarded into the render subprocess", () => {
	const step = stepNamed("Render").run as string;
	expect(step).not.toContain("GITHUB_");
	expect(step).not.toContain("ACTIONS_");
	expect(step).not.toContain("${{");
});

test("a seventh environment name would be a rejection fixture", () => {
	// Guard the shape the policy depends on: adding a name must be visible here.
	const step = stepNamed("Render").run as string;
	const polluted = step.replace("CI=true", "CI=true \\\n            AWS_SECRET_ACCESS_KEY=x");
	const assigned = [...polluted.matchAll(/^\s*([A-Z_][A-Z0-9_]*)=/gm)].map((m) => m[1]);
	expect(assigned).toContain("AWS_SECRET_ACCESS_KEY");
	// The shipped workflow carries no such name.
	expect(step).not.toContain("AWS_SECRET_ACCESS_KEY");
});

// --- upload ---------------------------------------------------------------

test("upload runs only on success with the exact name and retention", () => {
	const upload = stepUsing("actions/upload-artifact");
	expect(upload.if).toBe("success()");
	expect(upload.with.name).toBe("structurizr-c4-${{ github.sha }}");
	expect(upload.with["if-no-files-found"]).toBe("error");
	expect(Number(upload.with["retention-days"])).toBe(14);
	expect(upload.with.path).toBe("build/architecture/structurizr/");
});

test("upload is the last step, after a single render", () => {
	expect(steps[steps.length - 1]).toBe(stepUsing("actions/upload-artifact"));
	const renders = steps.filter(
		(step) => typeof step.run === "string" && step.run.includes("structurizr-render.ts"),
	);
	expect(renders).toHaveLength(1);
});

// --- rejection fixtures ---------------------------------------------------

test("no commit, push, emulation, or repeat-byte gate appears", () => {
	for (const forbidden of [
		"git commit",
		"git push",
		"--platform linux/arm64",
		"binfmt",
		"qemu",
		"tonistiigi/binfmt",
		"docker buildx",
		"cmp ",
		"diff -q",
	]) {
		expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
	}
});

test("no cache or alternate runner is used", () => {
	expect(text).not.toContain("actions/cache");
	for (const step of steps) {
		if (step.with !== undefined) expect(step.with.cache).toBeUndefined();
	}
	expect(Object.values(workflow.jobs)).toHaveLength(1);
});
