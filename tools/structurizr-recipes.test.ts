import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { IGNORE_ENTRIES } from "./structurizr-fs.ts";

const repoRoot = join(import.meta.dir, "..");
const recipesPath = join(repoRoot, "justfile.structurizr");
const recipes = readFileSync(recipesPath, "utf8");

/** Recipe body lines, excluding comments and blank lines. */
const bodyLines = recipes
	.split("\n")
	.filter((line) => line.startsWith("    ") && line.trim().length > 0);

// --- placement ------------------------------------------------------------

test("Structurizr recipes live only in justfile.structurizr", () => {
	expect(existsSync(recipesPath)).toBe(true);

	// Decision 1: justfile.opsx carries no Structurizr text or import, so an ordinary
	// install has no Structurizr inventory at all.
	const opsx = readFileSync(join(repoRoot, "justfile.opsx"), "utf8");
	expect(opsx.toLowerCase()).not.toContain("structurizr");
});

test("the recipe file declares exactly the public wrappers", () => {
	const names = [...recipes.matchAll(/^([a-z][\w-]*)\s+.*:$|^([a-z][\w-]*):$/gm)]
		.map((match) => match[1] ?? match[2])
		.filter(Boolean);
	expect(names.sort()).toEqual([
		"structurizr-clean",
		"structurizr-probe",
		"structurizr-render",
	]);
});

// --- thinness -------------------------------------------------------------

test("every recipe is a thin wrapper over a typed tool", () => {
	for (const line of bodyLines) {
		expect(line.trim().startsWith("@bun tools/structurizr-")).toBe(true);
	}
});

test("no safety logic is implemented in Just", () => {
	for (const construct of [
		"if ",
		"for ",
		"while ",
		"case ",
		"&&",
		"||",
		"sed -i",
		"rm ",
		"mkdir",
		"docker",
		">",
		"|",
	]) {
		expect(recipes.includes(`    ${construct}`)).toBe(false);
	}
	// Docker is never invoked from a recipe; the tools own that boundary.
	expect(bodyLines.join("\n")).not.toContain("docker");
});

// --- argument handling ----------------------------------------------------

test("the model argument defaults to empty and is passed through unchanged", () => {
	expect(recipes).toContain('structurizr-render model="":');
	expect(recipes).toContain("bun tools/structurizr-render.ts {{ model }}");
	expect(recipes).toContain("structurizr-clean:");
	expect(recipes).toContain("bun tools/structurizr-render.ts --clean");
});

test("the render wrapper rejects an arbitrary model through CONFIG MODEL_PATH", () => {
	const result = spawnSync("bun", ["tools/structurizr-render.ts", "docs/other.dsl"], {
		cwd: repoRoot,
		encoding: "utf8",
	});
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain("CONFIG MODEL_PATH");
});

test("the clean wrapper rejects a stray model argument", () => {
	const result = spawnSync(
		"bun",
		["tools/structurizr-render.ts", "--clean", "docs/other.dsl"],
		{ cwd: repoRoot, encoding: "utf8" },
	);
	expect(result.status).not.toBe(0);
	expect(`${result.stdout}${result.stderr}`).toContain("CONFIG INVOCATION");
});

// --- ignore boundary ------------------------------------------------------

test("exactly the three managed ignore entries are present", () => {
	const ignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
	for (const entry of IGNORE_ENTRIES) {
		const occurrences = ignore.split("\n").filter((line) => line.trim() === entry).length;
		expect(occurrences).toBe(1);
	}
});

test("no broad build ignore is introduced", () => {
	const ignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");
	const lines = ignore.split("\n").map((line) => line.trim());
	for (const broad of ["/build/", "build/", "build", "/build"]) {
		expect(lines).not.toContain(broad);
	}
});

test("generated output paths are ignored and no generated file is tracked", () => {
	const targets = [
		"build/architecture/structurizr/manifest.json",
		"build/architecture/.structurizr-lock",
		"build/architecture/.structurizr-stage-0123456789abcdef0123456789abcdef/payload/workspace.json",
	];
	for (const target of targets) {
		const result = spawnSync("git", ["check-ignore", target], {
			cwd: repoRoot,
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
	}

	const tracked = execFileSync("git", ["ls-files", "build/architecture/structurizr"], {
		cwd: repoRoot,
		encoding: "utf8",
	}).trim();
	expect(tracked).toBe("");
});

test("existing Mermaid recipes and gates are untouched", () => {
	const opsx = readFileSync(join(repoRoot, "justfile.opsx"), "utf8");
	// Recipe declarations, whether or not they take parameters.
	for (const recipe of ["arch-lint", "architecture-html", "docs-lint", "check-extensions"]) {
		expect(new RegExp(`^${recipe}[ :]`, "m").test(opsx)).toBe(true);
	}
});
