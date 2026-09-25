import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const installer = join(repoRoot, "install.sh");

const roots: string[] = [];
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const makeRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), "kit-install-"));
	roots.push(root);
	spawnSync("git", ["init", "-q", root], { stdio: "ignore" });
	writeFileSync(join(root, "justfile"), "default:\n    @just --list\n");
	writeFileSync(join(root, ".gitignore"), "node_modules/\n");
	return root;
};

const install = (root: string, ...flags: string[]) =>
	spawnSync("bash", [installer, "--here", root, ...flags], {
		encoding: "utf8",
		env: { ...process.env, PATH: process.env.PATH ?? "" },
	});

const sha = (path: string): string =>
	createHash("sha256").update(readFileSync(path)).digest("hex");

const MODEL = "docs/architecture/structurizr/workspace.dsl";

/** Every kit-owned path the opt-in must place. */
const KIT_FILES = [
	"justfile.structurizr",
	"tools/structurizr-source.ts",
	"tools/structurizr-fs.ts",
	"tools/structurizr-docker.ts",
	"tools/structurizr-verify.ts",
	"tools/structurizr-render.ts",
	"tools/structurizr-probe.ts",
	"tools/structurizr-pin.ts",
	"tools/structurizr/pin.json",
	"tools/structurizr/pin-evidence.md",
	"tools/vendor/structurizr-xml/NOTICE.md",
	"tools/vendor/structurizr-xml/node_modules/saxes/saxes.js",
	"tools/vendor/structurizr-xml/node_modules/xmlchars/LICENSE",
	".github/workflows/structurizr.yml",
];

// --- ordinary install -----------------------------------------------------

test("an ordinary install places no Structurizr item at all", () => {
	const root = makeRepo();
	const result = install(root);
	expect(result.status).toBe(0);

	for (const relative of [...KIT_FILES, MODEL]) {
		expect(existsSync(join(root, relative))).toBe(false);
	}
	expect(readFileSync(join(root, "justfile"), "utf8")).not.toContain("structurizr");
	expect(readFileSync(join(root, ".gitignore"), "utf8")).not.toContain("structurizr");
});

test("an ordinary install performs no Docker or Bun probe and emits no warning", () => {
	const root = makeRepo();
	const output = `${install(root).stdout}${install(root).stderr}`;
	expect(output.toLowerCase()).not.toContain("docker");
	expect(output.toLowerCase()).not.toContain("structurizr");
});

test("an ordinary install leaves Mermaid behaviour unchanged", () => {
	const root = makeRepo();
	install(root);
	// The Mermaid path ships arch-lint and the HTML renderer, as before.
	expect(existsSync(join(root, "tools/arch-lint.ts"))).toBe(true);
	expect(existsSync(join(root, "tools/architecture-html.ts"))).toBe(true);
	expect(readFileSync(join(root, "justfile.opsx"), "utf8")).not.toContain("structurizr");
});

// --- first opt-in ---------------------------------------------------------

test("the opt-in places the exact inventory and seeds the model", () => {
	const root = makeRepo();
	const result = install(root, "--with-structurizr");
	expect(result.status).toBe(0);

	for (const relative of KIT_FILES) {
		expect(existsSync(join(root, relative))).toBe(true);
	}
	expect(existsSync(join(root, MODEL))).toBe(true);

	// The seeded model is the template, byte for byte.
	expect(sha(join(root, MODEL))).toBe(
		sha(join(repoRoot, "templates/structurizr/workspace.dsl")),
	);
});

test("the opt-in writes one import block and the three exact ignore rules", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");

	const justfile = readFileSync(join(root, "justfile"), "utf8");
	expect(justfile.split('import "justfile.structurizr"').length - 1).toBe(1);
	expect(justfile).toContain("default:");

	const ignore = readFileSync(join(root, ".gitignore"), "utf8");
	for (const entry of [
		"/build/architecture/structurizr/",
		"/build/architecture/.structurizr-lock",
		"/build/architecture/.structurizr-stage-*/",
	]) {
		expect(ignore.split("\n").filter((line) => line.trim() === entry)).toHaveLength(1);
	}
	// Pre-existing content survives.
	expect(ignore).toContain("node_modules/");
});

test("no test, fixture, or attestation workflow is copied to a consumer", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");

	for (const relative of [
		"tools/structurizr-pin.test.ts",
		"tools/structurizr-verify.test.ts",
		"tools/fixtures/structurizr/workspace.dsl",
		"tools/fixtures/structurizr/svg-safety",
		"templates/structurizr/structurizr.yml",
		".github/workflows/structurizr-pin-attestation.yml",
	]) {
		expect(existsSync(join(root, relative))).toBe(false);
	}
});

// --- rerun ----------------------------------------------------------------

test("a second opt-in preserves an edited model byte for byte", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");

	const modelPath = join(root, MODEL);
	const edited = `${readFileSync(modelPath, "utf8")}\n# team edit, must survive\n`;
	writeFileSync(modelPath, edited);
	const before = sha(modelPath);

	const result = install(root, "--with-structurizr");
	expect(result.status).toBe(0);

	expect(sha(modelPath)).toBe(before);
	expect(readFileSync(modelPath, "utf8")).toContain("team edit, must survive");
});

test("a second opt-in deliberately refreshes kit-owned files", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");

	const kitPath = join(root, "tools/structurizr-render.ts");
	writeFileSync(kitPath, "// local drift\n");
	expect(sha(kitPath)).not.toBe(sha(join(repoRoot, "tools/structurizr-render.ts")));

	install(root, "--with-structurizr");
	expect(sha(kitPath)).toBe(sha(join(repoRoot, "tools/structurizr-render.ts")));
});

test("a rerun keeps exactly one copy of each managed block", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");
	install(root, "--with-structurizr");
	install(root, "--with-structurizr");

	const justfile = readFileSync(join(root, "justfile"), "utf8");
	expect(justfile.split('import "justfile.structurizr"').length - 1).toBe(1);

	const ignore = readFileSync(join(root, ".gitignore"), "utf8");
	expect(
		ignore.split("\n").filter((line) => line.trim() === "/build/architecture/.structurizr-lock"),
	).toHaveLength(1);
});

test("an ordinary rerun into an opted-in repo neither refreshes nor removes the option", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");

	const kitPath = join(root, "tools/structurizr-render.ts");
	writeFileSync(kitPath, "// drift that an ordinary install must not touch\n");

	install(root);

	expect(readFileSync(kitPath, "utf8")).toBe(
		"// drift that an ordinary install must not touch\n",
	);
	expect(existsSync(join(root, MODEL))).toBe(true);
	expect(readFileSync(join(root, "justfile"), "utf8")).toContain(
		'import "justfile.structurizr"',
	);
});

// --- removal --------------------------------------------------------------

test("removal is explicit, data-preserving, and idempotent", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");
	const modelPath = join(root, MODEL);
	const before = sha(modelPath);

	const first = install(root, "--remove-structurizr");
	expect(first.status).toBe(0);
	expect(first.stdout).toContain("retained team-owned model");

	for (const relative of KIT_FILES) {
		expect(existsSync(join(root, relative))).toBe(false);
	}
	// The team's model survives removal untouched.
	expect(existsSync(modelPath)).toBe(true);
	expect(sha(modelPath)).toBe(before);

	expect(readFileSync(join(root, "justfile"), "utf8")).not.toContain("justfile.structurizr");
	expect(readFileSync(join(root, ".gitignore"), "utf8")).not.toContain(".structurizr-lock");
	expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("node_modules/");

	// Idempotent.
	expect(install(root, "--remove-structurizr").status).toBe(0);
});

test("removal refuses while generated state still exists", () => {
	const root = makeRepo();
	install(root, "--with-structurizr");
	const parent = join(root, "build", "architecture");
	mkdirSync(parent, { recursive: true });
	writeFileSync(join(parent, ".structurizr-lock"), "{}");

	const result = install(root, "--remove-structurizr");
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain("structurizr-clean");
	// Nothing was removed.
	expect(existsSync(join(root, "justfile.structurizr"))).toBe(true);
});

// --- flag discipline ------------------------------------------------------

test("the two Structurizr flags are mutually exclusive", () => {
	const root = makeRepo();
	const result = install(root, "--with-structurizr", "--remove-structurizr");
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain("mutually exclusive");
});

test("the flags require an explicit project install", () => {
	const result = spawnSync("bash", [installer, "--with-structurizr"], { encoding: "utf8" });
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain("require --here");
});

test("unrelated installed guards, schemas, and learnings are not changed", () => {
	const root = makeRepo();
	install(root);
	const agentsBefore = existsSync(join(root, "AGENTS.md"))
		? sha(join(root, "AGENTS.md"))
		: undefined;

	install(root, "--with-structurizr");

	if (agentsBefore !== undefined) {
		expect(sha(join(root, "AGENTS.md"))).toBe(agentsBefore);
	}
	expect(existsSync(join(root, "learnings/_TEMPLATE.md"))).toBe(true);
	expect(existsSync(join(root, ".pi/extensions"))).toBe(true);
});
