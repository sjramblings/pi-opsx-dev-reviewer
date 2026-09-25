import { afterAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	CANONICAL_MODEL_PATH,
	MAX_MODEL_BYTES,
	StructurizrSourceError,
	modelMount,
	normalizeForHash,
	normalizeModelArgument,
	resolveSource,
	scanDirectives,
} from "./structurizr-source.ts";

const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const goodModel = [
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

/** Build a throwaway Git repository holding a model at the canonical path. */
const makeRepo = (content: string = goodModel): string => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-source-"));
	roots.push(root);
	execFileSync("git", ["init", "-q", root], { stdio: "ignore" });
	const modelFile = join(root, ...CANONICAL_MODEL_PATH.split("/"));
	mkdirSync(dirname(modelFile), { recursive: true });
	writeFileSync(modelFile, content);
	return root;
};

const expectCode = (run: () => unknown, code: string, needle?: string): void => {
	let message = "";
	try {
		run();
		throw new Error(`expected ${code}`);
	} catch (error) {
		expect(error).toBeInstanceOf(StructurizrSourceError);
		message = (error as Error).message;
	}
	expect(message.startsWith(`CONFIG ${code}: `)).toBe(true);
	if (needle !== undefined) expect(message).toContain(needle);
};

// --- the accepted model ---------------------------------------------------

test("the exact regular model resolves", () => {
	const root = makeRepo();
	const source = resolveSource({ root });

	expect(source.relativePath).toBe(CANONICAL_MODEL_PATH);
	expect(source.text).toBe(goodModel);
	expect(source.byteLength).toBe(Buffer.byteLength(goodModel));
	expect(source.sha256).toBe(
		createHash("sha256").update(goodModel).digest("hex"),
	);
});

test("an omitted argument selects the canonical path", () => {
	expect(normalizeModelArgument()).toBe(CANONICAL_MODEL_PATH);
	expect(normalizeModelArgument("")).toBe(CANONICAL_MODEL_PATH);
	expect(normalizeModelArgument(CANONICAL_MODEL_PATH)).toBe(CANONICAL_MODEL_PATH);
});

test("only the opened file is mounted, never its parent", () => {
	const root = makeRepo();
	const source = resolveSource({ root });
	const mount = modelMount(source);

	expect(mount).toBe(`${source.path}:/workspace/workspace.dsl:ro`);
	expect(mount.endsWith(":ro")).toBe(true);
	expect(mount.startsWith(`${dirname(source.path)}:`)).toBe(false);
});

// --- rejected spellings ---------------------------------------------------

test("an absolute path is rejected", () => {
	expectCode(
		() => normalizeModelArgument("/etc/passwd"),
		"MODEL_PATH",
		"must be omitted or exactly",
	);
});

test("an alternate or traversing spelling is rejected", () => {
	for (const spelling of [
		"./docs/architecture/structurizr/workspace.dsl",
		"docs/architecture/structurizr/../structurizr/workspace.dsl",
		"docs/architecture/structurizr/workspace.DSL",
		"../workspace.dsl",
		"docs/architecture/structurizr/",
	]) {
		expectCode(() => normalizeModelArgument(spelling), "MODEL_PATH");
	}
});

test("an arbitrary other model in the repository is rejected", () => {
	expectCode(() => normalizeModelArgument("tools/fixtures/structurizr/workspace.dsl"), "MODEL_PATH");
});

// --- filesystem shapes ----------------------------------------------------

test("a symlinked final component is rejected", () => {
	const root = makeRepo();
	const modelFile = join(root, ...CANONICAL_MODEL_PATH.split("/"));
	const decoy = join(root, "decoy.dsl");
	writeFileSync(decoy, goodModel);
	rmSync(modelFile);
	symlinkSync(decoy, modelFile);

	expectCode(() => resolveSource({ root }), "MODEL_PATH", "symbolic link");
});

test("a symlinked ancestor is rejected", () => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-source-"));
	roots.push(root);
	execFileSync("git", ["init", "-q", root], { stdio: "ignore" });

	const real = join(root, "real-structurizr");
	mkdirSync(real, { recursive: true });
	writeFileSync(join(real, "workspace.dsl"), goodModel);

	mkdirSync(join(root, "docs", "architecture"), { recursive: true });
	symlinkSync(real, join(root, "docs", "architecture", "structurizr"));

	expectCode(() => resolveSource({ root }), "MODEL_PATH", "symbolic link");
});

test("a directory in place of the model is rejected", () => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-source-"));
	roots.push(root);
	execFileSync("git", ["init", "-q", root], { stdio: "ignore" });
	mkdirSync(join(root, ...CANONICAL_MODEL_PATH.split("/")), { recursive: true });

	expectCode(() => resolveSource({ root }), "MODEL_PATH");
});

test("a FIFO in place of the model is rejected", () => {
	const root = makeRepo();
	const modelFile = join(root, ...CANONICAL_MODEL_PATH.split("/"));
	rmSync(modelFile);
	execFileSync("mkfifo", [modelFile]);

	expectCode(() => resolveSource({ root }), "MODEL_PATH", "not a regular file");
});

test("a missing model is rejected", () => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-source-"));
	roots.push(root);
	execFileSync("git", ["init", "-q", root], { stdio: "ignore" });

	expectCode(() => resolveSource({ root }), "MODEL_PATH", "does not exist");
});

test("an oversized model is rejected", () => {
	const root = makeRepo(`${goodModel}\n${"# padding\n".repeat(1)}`);
	const modelFile = join(root, ...CANONICAL_MODEL_PATH.split("/"));
	writeFileSync(modelFile, Buffer.alloc(MAX_MODEL_BYTES + 1, 0x20));

	expectCode(() => resolveSource({ root }), "MODEL_PATH", "over the");
});

test("invalid UTF-8 is rejected", () => {
	const root = makeRepo();
	const modelFile = join(root, ...CANONICAL_MODEL_PATH.split("/"));
	writeFileSync(modelFile, Buffer.from([0x77, 0x73, 0xff, 0xfe, 0x0a]));

	expectCode(() => resolveSource({ root }), "MODEL_PATH", "strict UTF-8");
});

// --- directives -----------------------------------------------------------

test("each permitted directive is accepted", () => {
	for (const directive of [
		"!identifiers hierarchical",
		"!impliedRelationships true",
		"!impliedRelationships false",
	]) {
		expect(() => scanDirectives(`${directive}\nworkspace "x" {}\n`)).not.toThrow();
	}
	// Leading spaces and tabs are skipped before the directive.
	expect(() => scanDirectives("\t  !identifiers hierarchical\n")).not.toThrow();
});

test("every prohibited directive is rejected", () => {
	for (const directive of [
		"!include other.dsl",
		"!docs docs/",
		"!adrs docs/decisions",
		"!script groovy",
		"!plugin com.example.Plugin",
		"!constant NAME value",
		"!identifiers flat",
		"!IDENTIFIERS hierarchical",
	]) {
		expectCode(() => scanDirectives(`${directive}\n`), "SOURCE_DIRECTIVE");
	}
});

test("a true workspace extension is rejected", () => {
	expectCode(
		() => scanDirectives('workspace extends other.dsl {\n}\n'),
		"WORKSPACE_EXTENDS",
	);
	expectCode(
		() => scanDirectives('  workspace   extends   "https://example.com/w.json" {\n}\n'),
		"WORKSPACE_EXTENDS",
	);
});

test("quoted or commented extends text stays accepted", () => {
	expect(() =>
		scanDirectives('workspace "Extends the legacy system" "This extends nothing." {\n}\n'),
	).not.toThrow();
	expect(() => scanDirectives("# workspace extends other.dsl\n")).not.toThrow();
	expect(() => scanDirectives("// workspace extends other.dsl\n")).not.toThrow();
	expect(() =>
		scanDirectives('/*\nworkspace extends other.dsl\n*/\nworkspace "x" {}\n'),
	).not.toThrow();
});

test("a prohibited directive in a real model fails before Docker", () => {
	const root = makeRepo(`!include shared.dsl\n${goodModel}`);
	expectCode(() => resolveSource({ root }), "SOURCE_DIRECTIVE", "!include shared.dsl");
});

test("a real extending model fails before Docker", () => {
	const root = makeRepo('workspace extends base.dsl {\n}\n');
	expectCode(() => resolveSource({ root }), "WORKSPACE_EXTENDS");
});

// --- hashing --------------------------------------------------------------

test("the source hash uses LF while the mounted bytes keep their line endings", () => {
	const crlf = goodModel.replace(/\n/g, "\r\n");
	const root = makeRepo(crlf);
	const source = resolveSource({ root });

	// The file on disk is untouched.
	const onDisk = readFileSync(join(root, ...CANONICAL_MODEL_PATH.split("/")));
	expect(onDisk.includes(Buffer.from("\r\n"))).toBe(true);
	expect(source.bytes.equals(onDisk)).toBe(true);

	// The hash matches the LF-normalized form, so line endings do not move the manifest.
	expect(source.sha256).toBe(createHash("sha256").update(goodModel).digest("hex"));
});

test("lone CR normalizes to LF for hashing", () => {
	const cr = Buffer.from("a\rb\r\nc\n");
	expect(normalizeForHash(cr).toString()).toBe("a\nb\nc\n");
});
