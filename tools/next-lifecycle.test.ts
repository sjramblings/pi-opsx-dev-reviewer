import { expect, test } from "bun:test";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const justfile = resolve("justfile.opsx");
const projectOnboardingDelta = resolve(
	"openspec/changes/add-orchestrator-bookkeeping/specs/project-onboarding/spec.md",
);

function read(path: string): string {
	return readFileSync(resolve(path), "utf8");
}

function effectiveProjectOnboardingContract(): string {
	const path = existsSync(projectOnboardingDelta)
		? projectOnboardingDelta
		: resolve("openspec/specs/project-onboarding/spec.md");
	return readFileSync(path, "utf8");
}

function expectGuardedCloseOut(surface: string): void {
	expect(surface).toContain("just archive-change");
	expect(surface).not.toMatch(/\bjust\s+archive-check\b/);
	expect(surface).not.toMatch(/\bopenspec\s+archive\b/);
}

function parseShellWords(command: string): string[] {
	const result = Bun.spawnSync(["bash", "-c", `set -- ${command}\nprintf '%s\\0' "$@"`], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new Error(`failed to parse emitted command: ${result.stderr.toString()}`);
	}
	const output = result.stdout.toString();
	if (!output.endsWith("\0")) {
		throw new Error("failed to parse emitted command: bash returned an incomplete argument list");
	}
	return output.slice(0, -1).split("\0");
}

function runNext(tasks: string): string {
	const root = mkdtempSync(join(tmpdir(), "next-lifecycle-test-"));
	try {
		const changeDir = join(root, "openspec", "changes", "fixture-change");
		mkdirSync(changeDir, { recursive: true });
		writeFileSync(join(changeDir, "tasks.md"), tasks);
		writeFileSync(join(changeDir, "review-log.md"), "# Review log\n");
		const fixtureJustfile = join(root, "justfile.opsx");
		copyFileSync(justfile, fixtureJustfile);

		const result = Bun.spawnSync(["just", "--justfile", fixtureJustfile, "next", "fixture-change"], {
			cwd: root,
			stdout: "pipe",
			stderr: "pipe",
		});
		if (result.exitCode !== 0) {
			throw new Error(`just next failed: ${result.stderr.toString()}`);
		}
		return result.stdout.toString();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("in-progress next output requires session discovery and the two-argument loop form", () => {
	const output = runNext("- [x] 1.1 Complete\n- [ ] 1.2 Pending\n");

	expect(output).toContain("/session");
	const emittedExample = output.match(/\/opsx-loop fixture-change (?:"[^"]*"|\S+)/)?.[0];
	expect(emittedExample).toBe('/opsx-loop fixture-change "/absolute/path/to/session.jsonl"');
	if (emittedExample === undefined) {
		throw new Error("just next did not emit an /opsx-loop example");
	}

	const spacedPath = "/absolute/path with spaces/to/session.jsonl";
	const spacedExample = emittedExample.replace("/absolute/path/to/session.jsonl", spacedPath);
	expect(parseShellWords(spacedExample)).toEqual(["/opsx-loop", "fixture-change", spacedPath]);
	expect(output).not.toContain("<");
	expect(output).not.toContain(">");
});

test("completed next output directs retro before protected archival", () => {
	const output = runNext("- [x] 1.1 Complete\n- [x] 1.2 Complete\n");
	const retro = output.indexOf("/opsx-retro fixture-change");
	const archive = output.indexOf("just archive-change fixture-change");

	expect(retro).toBeGreaterThanOrEqual(0);
	expect(archive).toBeGreaterThan(retro);
	expectGuardedCloseOut(output);
});

test("every lifecycle protocol surface requires guarded archival with no stale raw path", () => {
	const retroPrompt = read("prompts/opsx-retro.md");
	expect(retroPrompt).toMatch(
		/^6\. Only then close out through the guarded path: `just archive-change \$1`\.$/m,
	);
	const surfaces = {
		"loop prompt": read("prompts/opsx-loop.md"),
		"retro prompt": retroPrompt,
		"schema apply instruction": read("openspec/schemas/dev-reviewer/schema.yaml"),
		"installed AGENTS template": read("templates/AGENTS.md"),
		"effective project-onboarding contract": effectiveProjectOnboardingContract(),
	};

	for (const [name, surface] of Object.entries(surfaces)) {
		try {
			expectGuardedCloseOut(surface);
		} catch (error) {
			throw new Error(`stale close-out path in ${name}`, { cause: error });
		}
	}
});
