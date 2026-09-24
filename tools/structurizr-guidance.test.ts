import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
const writer = readFileSync(join(repoRoot, "agents", "architecture-writer.md"), "utf8");
const agentsTemplate = readFileSync(join(repoRoot, "templates", "AGENTS.md"), "utf8");

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// --- ownership guidance ---------------------------------------------------

test("the writer may only update an existing model, never create one", () => {
	expect(writer).toContain("Structurizr is optional and team-owned");
	expect(writer).toContain("never\n   create the model");
	expect(writer).toContain("you may update that one existing file");
});

test("the writer stays silent when the option is absent", () => {
	expect(writer).toContain("never invoke it, never warn about it");
});

test("the writer preserves the canonical invariants", () => {
	for (const invariant of [
		"hierarchical identifiers",
		"`context`, `container`, and\n   `component`",
		"reaches a component directly",
		"maintainer for\n   review",
	]) {
		expect(writer).toContain(invariant);
	}
});

test("the writer prohibits source expansion in the model", () => {
	expect(writer).toContain(
		"no include, workspace extension, docs/ADR,\n   script, plugin, or remote theme",
	);
});

test("generated SVG can never satisfy a Mermaid requirement", () => {
	expect(writer).toContain("can\n   NEVER satisfy a missing Mermaid fence");
	expect(writer).toContain("Never embed generated");
	expect(agentsTemplate).toContain("never satisfies a Mermaid requirement");
});

test("the installed AGENTS template carries the same ownership rules", () => {
	for (const rule of [
		"Mermaid is the default and the only required diagram contract",
		"team-owned source",
		"never create or replace it",
		"do not invoke it and do not\nwarn about it",
		"never committed",
	]) {
		expect(agentsTemplate).toContain(rule);
	}
});

test("the Mermaid presence rules for sections 3, 5, and 7 are unchanged", () => {
	// 5a is the pre-existing contract; the Structurizr rules are additive only.
	expect(writer).toContain("Include a Mermaid diagram in the diagram-bearing sections");
	expect(writer).toContain("the context and scope section");
	expect(writer).toContain("the building block view section");
	expect(writer).toContain("the deployment view section");
	expect(agentsTemplate).toContain("sections 3 (context");
	expect(agentsTemplate).toContain("5 (building block view)");
	expect(agentsTemplate).toContain("7 (deployment view)");
});

// --- Mermaid non-regression -----------------------------------------------

/** A minimal but complete arc42 tree whose required sections all carry a diagram. */
const writeTree = (root: string, buildingBlockDiagram: boolean): string => {
	const tree = join(root, "docs", "architecture");
	mkdirSync(tree, { recursive: true });
	const fence = (body: string) => "```mermaid\n" + body + "\n```\n";
	const sections: Array<[string, string]> = [
		[
			"README.md",
			"# Architecture\n\nStakeholders: maintainers. Concerns: clarity.\nPresented views: context, building block, deployment.\n",
		],
		[
			"01-introduction-and-goals.md",
			"# Introduction and Goals\n\nStakeholders: maintainers.\nConcerns: clarity.\n",
		],
		["02-constraints.md", "# Constraints\n\nBun only.\n"],
		[
			"03-context-and-scope.md",
			"# Context and Scope\n\n" + fence("flowchart LR\n  a[User] --> b[System]"),
		],
		[
			"04-solution-strategy.md",
			"# Solution Strategy\n\nWe accept a slower gate as the cost of fail-closed checks.\n",
		],
		[
			"05-building-block-view.md",
			"# Building Block View\n\n" +
				(buildingBlockDiagram ? fence("flowchart TD\n  x[App] --> y[Tool]") : "Prose only.\n"),
		],
		["06-runtime-view.md", "# Runtime View\n\nRuntime.\n"],
		[
			"07-deployment-view.md",
			"# Deployment View\n\n" + fence("flowchart TD\n  r[Runner] --> c[Container]"),
		],
		["08-crosscutting-concepts.md", "# Crosscutting Concepts\n\nConcepts.\n"],
		[
			"09-architecture-decisions.md",
			"# Architecture Decisions\n\nDecisions: none recorded yet; no ADRs exist.\n",
		],
		["10-quality-requirements.md", "# Quality Requirements\n\nQuality.\n"],
		["11-risks-and-technical-debt.md", "# Risks and Technical Debt\n\nRisks.\n"],
		["12-glossary.md", "# Glossary\n\nTerms.\n"],
	];
	for (const [name, body] of sections) writeFileSync(join(tree, name), body);
	return tree;
};

const archLint = (cwd: string, tree: string) =>
	spawnSync("bun", [join(repoRoot, "tools", "arch-lint.ts"), tree, "docs/decisions"], {
		cwd,
		encoding: "utf8",
	});

test("Mermaid lint results are identical before and after option installation", () => {
	const root = mkdtempSync(join(tmpdir(), "structurizr-guidance-"));
	scratch.push(root);
	spawnSync("git", ["init", "-q", root], { stdio: "ignore" });
	writeFileSync(join(root, "justfile"), "default:\n    @just --list\n");
	writeFileSync(join(root, ".gitignore"), "node_modules/\n");
	writeTree(root, true);

	const before = archLint(root, "docs/architecture");

	const install = spawnSync(
		"bash",
		[join(repoRoot, "install.sh"), "--here", root, "--with-structurizr"],
		{ encoding: "utf8" },
	);
	expect(install.status).toBe(0);
	expect(existsSync(join(root, "justfile.structurizr"))).toBe(true);

	const after = archLint(root, "docs/architecture");

	// Installing the option moves neither the verdict nor the reported findings.
	expect(after.status).toBe(before.status);
	expect(after.stdout).toBe(before.stdout);
	// And the Mermaid gate never mentions Structurizr.
	expect(after.stdout.toLowerCase()).not.toContain("structurizr");
}, 60_000);

test("valid Structurizr output does not satisfy a missing Mermaid fence", () => {
	const fixture = mkdtempSync(join(tmpdir(), "structurizr-guidance-"));
	scratch.push(fixture);

	// A tree whose building block view has no Mermaid fence.
	const tree = join(fixture, "docs", "architecture");
	mkdirSync(tree, { recursive: true });
	const sections = [
		["01-introduction-and-goals.md", "# Introduction and Goals\n\nGoals.\n"],
		["02-constraints.md", "# Constraints\n\nConstraints.\n"],
		[
			"03-context-and-scope.md",
			"# Context and Scope\n\n```mermaid\nflowchart LR\n  a[User] --> b[System]\n```\n",
		],
		["04-solution-strategy.md", "# Solution Strategy\n\nStrategy.\n"],
		// Deliberately missing its Mermaid fence.
		["05-building-block-view.md", "# Building Block View\n\nProse only, no diagram.\n"],
		["06-runtime-view.md", "# Runtime View\n\nRuntime.\n"],
		[
			"07-deployment-view.md",
			"# Deployment View\n\n```mermaid\nflowchart TD\n  x[Runner] --> y[Container]\n```\n",
		],
		["08-crosscutting-concepts.md", "# Crosscutting Concepts\n\nConcepts.\n"],
		["09-architecture-decisions.md", "# Architecture Decisions\n\nNone.\n"],
		["10-quality-requirements.md", "# Quality Requirements\n\nQuality.\n"],
		["11-risks-and-technical-debt.md", "# Risks and Technical Debt\n\nRisks.\n"],
		["12-glossary.md", "# Glossary\n\nTerms.\n"],
		["README.md", "# Architecture\n\nIndex.\n"],
	];
	for (const [name, body] of sections) writeFileSync(join(tree, name), body);

	// Valid, verified Structurizr output sits alongside it.
	const generated = join(fixture, "build", "architecture", "structurizr");
	mkdirSync(generated, { recursive: true });
	const passive = join(
		import.meta.dir,
		"fixtures",
		"structurizr",
		"svg-safety",
		"passive",
	);
	for (const name of ["context.svg", "container.svg", "component.svg"]) {
		cpSync(join(passive, name), join(generated, name));
	}
	expect(existsSync(join(generated, "container.svg"))).toBe(true);

	// The gate still fails, and it fails on the Mermaid contract.
	const result = spawnSync(
		"bun",
		[join(repoRoot, "tools", "arch-lint.ts"), "docs/architecture", "docs/decisions"],
		{ cwd: fixture, encoding: "utf8" },
	);
	const output = `${result.stdout}${result.stderr}`;

	expect(result.status).not.toBe(0);
	expect(output.toLowerCase()).toContain("building-block");
	// The failure is about the missing diagram, not about Structurizr.
	expect(output.toLowerCase()).not.toContain("structurizr");
}, 60_000);
