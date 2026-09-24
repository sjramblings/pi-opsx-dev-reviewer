import { expect, test } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const change = "partial-modified";
const capability = "fixture-capability";
const requirement = "Existing behaviour survives";
const mainBody = "This descriptive body must survive promotion.";
const originalScenarios = ["First original", "Second original"];
const newScenario = "New behaviour";
const guardPath = join(import.meta.dir, "promote-guard.ts");

type Workspace = {
	root: string;
	changeDir: string;
	mainSpecPath: string;
};

type CommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

function requirementMarkdown(
	name: string,
	body: string,
	scenarios: string[],
): string {
	const scenarioBlocks = scenarios.map(
		(scenario) =>
			`#### Scenario: ${scenario}\n\n- **WHEN** ${scenario} runs\n- **THEN** its result is retained`,
	);
	const bodyBlock = body === "" ? "" : `${body}\n\n`;
	return `### Requirement: ${name}\n\n${bodyBlock}${scenarioBlocks.join("\n\n")}`;
}

function mainSpec(body: string = mainBody, scenarios: string[] = originalScenarios): string {
	return `# Fixture Specification\n\n## Purpose\n\nFixture.\n\n## Requirements\n\n${requirementMarkdown(requirement, body, scenarios)}\n`;
}

function deltaSpec(
	section: "ADDED" | "MODIFIED",
	body: string,
	scenarios: string[],
	name: string = requirement,
): string {
	return `# Fixture delta\n\n## ${section} Requirements\n\n${requirementMarkdown(name, body, scenarios)}\n`;
}

function withWorkspace<T>(run: (workspace: Workspace) => T): T {
	const root = mkdtempSync(join(tmpdir(), "promote-guard-test-"));
	const mainSpecPath = join(root, "openspec", "specs", capability, "spec.md");
	const changeDir = join(root, "openspec", "changes", change);
	try {
		mkdirSync(join(root, "openspec", "specs", capability), { recursive: true });
		mkdirSync(join(changeDir, "specs", capability), { recursive: true });
		writeFileSync(mainSpecPath, mainSpec(), "utf8");
		writeFileSync(
			join(changeDir, "proposal.md"),
			"# Proposal\n\n## Why\n\nReproduce promotion.\n\n## What Changes\n\nModify a fixture.\n",
			"utf8",
		);
		writeFileSync(join(changeDir, "tasks.md"), "# Tasks\n\n- [x] Reproduce promotion.\n", "utf8");
		return run({ root, changeDir, mainSpecPath });
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

function writeDelta(workspace: Workspace, markdown: string, name: string = capability): void {
	const capabilityDir = join(workspace.changeDir, "specs", name);
	mkdirSync(capabilityDir, { recursive: true });
	writeFileSync(join(capabilityDir, "spec.md"), markdown, "utf8");
}

function invoke(command: string[], cwd: string): CommandResult {
	const result = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString(),
		stderr: result.stderr.toString(),
	};
}

function invokeGuard(workspace: Workspace): CommandResult {
	return invoke(["bun", guardPath, change], workspace.root);
}

test("RED reproducer: OpenSpec drops the body and two original scenarios for one new scenario", () => {
	withWorkspace((workspace) => {
		writeDelta(
			workspace,
			deltaSpec("MODIFIED", "The fixture SHALL use a replacement description.", [newScenario]),
		);

		const promotion = invoke(["openspec", "archive", change, "-y"], workspace.root);
		expect(promotion.exitCode).toBe(0);
		const promoted = readFileSync(workspace.mainSpecPath, "utf8");

		expect({
			scenarioCount: [...promoted.matchAll(/^#### Scenario:/gm)].length,
			bodyPresent: promoted.includes(mainBody),
		}).toEqual({ scenarioCount: 1, bodyPresent: false });
	});
});

test("partial MODIFIED refusal names every loss and leaves every main spec byte-identical", () => {
	withWorkspace((workspace) => {
		writeDelta(
			workspace,
			deltaSpec("MODIFIED", "The fixture SHALL use a replacement description.", [newScenario]),
		);
		const siblingCapability = "untouched-capability";
		const siblingPath = join(workspace.root, "openspec", "specs", siblingCapability, "spec.md");
		mkdirSync(join(workspace.root, "openspec", "specs", siblingCapability), { recursive: true });
		writeFileSync(siblingPath, "# Untouched Specification\n\n## Requirements\n", "utf8");
		const before = new Map([
			[workspace.mainSpecPath, readFileSync(workspace.mainSpecPath)],
			[siblingPath, readFileSync(siblingPath)],
		]);

		const result = invokeGuard(workspace);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("UNSAFE_PARTIAL_MODIFIED");
		expect(result.stderr).toContain(`capability \"${capability}\"`);
		expect(result.stderr).toContain(`requirement \"${requirement}\"`);
		expect(result.stderr).toContain(`\"${originalScenarios[0]}\"`);
		expect(result.stderr).toContain(`\"${originalScenarios[1]}\"`);
		expect(result.stderr).toContain(
			`agent-driven spec sync for capability \"${capability}\" only`,
		);
		for (const [path, contents] of before) {
			expect(readFileSync(path)).toEqual(contents);
		}
	});
});

test("MODIFIED body omission is refused even when every main scenario is restated", () => {
	withWorkspace((workspace) => {
		writeDelta(workspace, deltaSpec("MODIFIED", "", originalScenarios));
		const before = readFileSync(workspace.mainSpecPath);

		const result = invokeGuard(workspace);

		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("the descriptive body would be lost");
		expect(result.stderr).toContain("scenarios that would be lost: none");
		expect(readFileSync(workspace.mainSpecPath)).toEqual(before);
	});
});

test("full MODIFIED restatement passes", () => {
	withWorkspace((workspace) => {
		writeDelta(
			workspace,
			deltaSpec("MODIFIED", mainBody, [...originalScenarios, newScenario]),
		);

		const result = invokeGuard(workspace);

		expect(result).toEqual({
			exitCode: 0,
			stdout:
				"promote-guard: safe: checked 1 MODIFIED requirement(s) across 1 capability delta(s)\n",
			stderr: "",
		});
	});
});

test("ADDED-only delta passes without inspecting main requirements", () => {
	withWorkspace((workspace) => {
		writeFileSync(workspace.mainSpecPath, "not a valid capability spec", "utf8");
		writeDelta(
			workspace,
			deltaSpec("ADDED", "The fixture SHALL add behaviour.", [newScenario], "Added behaviour"),
		);

		const result = invokeGuard(workspace);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("checked 0 MODIFIED requirement(s)");
	});
});

test("MODIFIED delta passes when its capability has no main spec", () => {
	withWorkspace((workspace) => {
		rmSync(workspace.mainSpecPath);
		writeDelta(workspace, deltaSpec("MODIFIED", "", [newScenario]));

		const result = invokeGuard(workspace);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("promote-guard: safe");
	});
});
