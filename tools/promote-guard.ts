/*
 * promote-guard.ts — refuse OpenSpec promotions that would replace existing content.
 *
 * Runs via bun; not a pi extension.
 *
 * usage: bun tools/promote-guard.ts <change>
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

type Requirement = {
	name: string;
	bodyPresent: boolean;
	scenarios: string[];
};

type UnsafeModification = {
	capability: string;
	requirement: string;
	bodyLost: boolean;
	lostScenarios: string[];
};

export type PromoteGuardResult = {
	capabilitiesChecked: number;
	modifiedRequirementsChecked: number;
};

export class PromoteGuardError extends Error {
	constructor(
		readonly reason: string,
		message: string,
	) {
		super(message);
		this.name = "PromoteGuardError";
	}
}

function fail(reason: string, message: string): never {
	throw new PromoteGuardError(reason, message);
}

function errorDetail(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
	return typeof error.code === "string" ? error.code : undefined;
}

function optionalText(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return null;
		return fail("SPEC_READ_FAILED", `${path}: ${errorDetail(error)}`);
	}
}

function assertChangeDirectory(path: string): void {
	let isDirectory: boolean;
	try {
		isDirectory = statSync(path).isDirectory();
	} catch (error: unknown) {
		return fail("CHANGE_NOT_FOUND", `${path}: ${errorDetail(error)}`);
	}
	if (!isDirectory) {
		return fail("CHANGE_NOT_FOUND", `${path}: change path is not a directory`);
	}
}

function capabilityNames(specsDir: string): string[] {
	try {
		return readdirSync(specsDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch (error: unknown) {
		if (errorCode(error) === "ENOENT") return [];
		return fail("DELTA_SPECS_READ_FAILED", `${specsDir}: ${errorDetail(error)}`);
	}
}

function malformed(source: string, lineNumber: number, detail: string): never {
	return fail("MALFORMED_SPEC", `${source}:${lineNumber}: ${detail}`);
}

function parseRequirements(
	markdown: string,
	source: string,
	sectionHeading: string,
	requireSection: boolean = false,
): Requirement[] {
	const requirements: Requirement[] = [];
	const names = new Set<string>();
	const lines = markdown.split(/\r?\n/);
	let inSection = false;
	let sawSection = false;
	let current: Requirement | null = null;
	let sawScenario = false;

	function finishCurrent(lineNumber: number): void {
		if (current === null) return;
		if (names.has(current.name)) {
			return malformed(source, lineNumber, `duplicate requirement ${JSON.stringify(current.name)}`);
		}
		names.add(current.name);
		requirements.push(current);
		current = null;
		sawScenario = false;
	}

	for (const [index, line] of lines.entries()) {
		const lineNumber = index + 1;
		if (/^##(?: |$)/.test(line)) {
			finishCurrent(lineNumber);
			inSection = line.trimEnd() === sectionHeading;
			if (inSection) sawSection = true;
			continue;
		}
		if (!inSection) continue;

		if (/^###(?: |$)/.test(line)) {
			finishCurrent(lineNumber);
			const match = /^### Requirement:\s*(.+?)\s*$/.exec(line);
			if (!match?.[1]) {
				return malformed(
					source,
					lineNumber,
					`${sectionHeading} contains a malformed requirement heading`,
				);
			}
			current = { name: match[1], bodyPresent: false, scenarios: [] };
			continue;
		}
		if (current === null) {
			if (line.trim() !== "") {
				return malformed(source, lineNumber, `${sectionHeading} contains content before a requirement`);
			}
			continue;
		}

		const scenario = /^#### Scenario:\s*(.+?)\s*$/.exec(line);
		if (scenario?.[1]) {
			if (current.scenarios.includes(scenario[1])) {
				return malformed(
					source,
					lineNumber,
					`duplicate scenario ${JSON.stringify(scenario[1])} in requirement ${JSON.stringify(current.name)}`,
				);
			}
			current.scenarios.push(scenario[1]);
			sawScenario = true;
			continue;
		}
		if (!sawScenario && line.trim() !== "") current.bodyPresent = true;
	}
	finishCurrent(lines.length + 1);
	if (requireSection && !sawSection) {
		return malformed(source, 1, `required section ${sectionHeading} is missing`);
	}
	return requirements;
}

function refusalMessage(unsafe: UnsafeModification[]): string {
	return unsafe
		.map((issue) => {
			const losses: string[] = [];
			if (issue.bodyLost) losses.push("the descriptive body would be lost");
			losses.push(
				issue.lostScenarios.length === 0
					? "scenarios that would be lost: none"
					: `scenarios that would be lost: ${issue.lostScenarios.map((name) => JSON.stringify(name)).join(", ")}`,
			);
			return [
				`capability ${JSON.stringify(issue.capability)}, requirement ${JSON.stringify(issue.requirement)}: ${losses.join("; ")}.`,
				`Use the agent-driven spec sync for capability ${JSON.stringify(issue.capability)} only.`,
			].join("\n");
		})
		.join("\n\n");
}

export function promoteGuard(
	change: string,
	rootDir: string = process.cwd(),
): PromoteGuardResult {
	if (
		change === "" ||
		change === "." ||
		change === ".." ||
		basename(change) !== change ||
		change.includes("/") ||
		change.includes("\\") ||
		change.includes("\0")
	) {
		return fail("INVALID_CHANGE", "change must be a single non-empty path segment");
	}

	const changeDir = join(rootDir, "openspec", "changes", change);
	assertChangeDirectory(changeDir);
	const capabilities = capabilityNames(join(changeDir, "specs"));
	const unsafe: UnsafeModification[] = [];
	let modifiedRequirementsChecked = 0;

	for (const capability of capabilities) {
		const deltaPath = join(changeDir, "specs", capability, "spec.md");
		const delta = optionalText(deltaPath);
		if (delta === null) continue;
		const modified = parseRequirements(delta, deltaPath, "## MODIFIED Requirements");
		if (modified.length === 0) continue;

		const mainPath = join(rootDir, "openspec", "specs", capability, "spec.md");
		const main = optionalText(mainPath);
		if (main === null) continue;
		const mainByName = new Map(
			parseRequirements(main, mainPath, "## Requirements", true).map((item) => [item.name, item]),
		);

		for (const deltaRequirement of modified) {
			modifiedRequirementsChecked += 1;
			const mainRequirement = mainByName.get(deltaRequirement.name);
			if (mainRequirement === undefined) continue;
			const deltaScenarios = new Set(deltaRequirement.scenarios);
			const lostScenarios = mainRequirement.scenarios.filter(
				(scenario) => !deltaScenarios.has(scenario),
			);
			const bodyLost = mainRequirement.bodyPresent && !deltaRequirement.bodyPresent;
			if (!bodyLost && lostScenarios.length === 0) continue;
			unsafe.push({
				capability,
				requirement: deltaRequirement.name,
				bodyLost,
				lostScenarios,
			});
		}
	}

	if (unsafe.length > 0) {
		return fail("UNSAFE_PARTIAL_MODIFIED", refusalMessage(unsafe));
	}
	return { capabilitiesChecked: capabilities.length, modifiedRequirementsChecked };
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	if (args.length !== 1) {
		process.stderr.write("promote-guard: USAGE: promote-guard.ts <change>\n");
		process.exit(2);
	}
	try {
		const result = promoteGuard(args[0] ?? "");
		process.stdout.write(
			`promote-guard: safe: checked ${result.modifiedRequirementsChecked} MODIFIED requirement(s) across ${result.capabilitiesChecked} capability delta(s)\n`,
		);
	} catch (error: unknown) {
		if (error instanceof PromoteGuardError) {
			process.stderr.write(`promote-guard: ${error.reason}: ${error.message}\n`);
		} else {
			process.stderr.write(`promote-guard: UNEXPECTED_ERROR: ${errorDetail(error)}\n`);
		}
		process.exit(1);
	}
}
