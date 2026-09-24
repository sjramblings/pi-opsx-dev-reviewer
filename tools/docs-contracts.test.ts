import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
	checkDocsContracts,
	localReferences,
	parseReflectionExample,
	sessionPathContractFailures,
	temporaryTranscriptReferences,
	unresolvedLocalReferences,
} from "./check-doc-contracts.ts";

const read = (path: string): string => readFileSync(path, "utf8");

test("retro reflection example is valid single-line JSON", () => {
	expect(parseReflectionExample(read("prompts/opsx-retro.md"))).toMatchObject({ change: "$1" });
});

test("missing or malformed reflection examples fail", () => {
	expect(() => parseReflectionExample("no example")).toThrow("is missing");
	expect(() => parseReflectionExample('`{"change":"$1",}`')).toThrow();
});

test("ephemeral transcript references are rejected", () => {
	expect(temporaryTranscriptReferences("evidence: /tmp/run.raw")).toEqual(["/tmp/run.raw"]);
	expect(temporaryTranscriptReferences("durable: probes/run.txt")).toEqual([]);
});

test("required close-out references resolve semantically", () => {
	const target = mkdtempSync(join(tmpdir(), "docs-reference-contract-"));
	try {
		mkdirSync(join(target, "docs"));
		writeFileSync(join(target, "README.md"), "[guide](docs/close-out.md) and `config/policy.yaml`\n");
		writeFileSync(join(target, "docs", "close-out.md"), "close out\n");
		mkdirSync(join(target, "config"));
		writeFileSync(join(target, "config", "policy.yaml"), "enabled: true\n");
		expect(unresolvedLocalReferences(target, ["README.md"])).toEqual([]);
		writeFileSync(join(target, "README.md"), "[guide](docs/missing.md) and `config/missing.yaml`\n");
		expect(unresolvedLocalReferences(target, ["README.md"])).toEqual([
			{ document: "README.md", target: "docs/missing.md" },
			{ document: "README.md", target: "config/missing.yaml" },
		]);
	} finally {
		rmSync(target, { recursive: true, force: true });
	}
});

test("local reference extraction ignores external and fragment links", () => {
	expect(localReferences("README.md", "[local](docs/close-out.md) [web](https://example.com) [section](#close-out)")).toEqual([
		{ document: "README.md", target: "docs/close-out.md" },
	]);
});

test("session path contract distinguishes mandatory protocol from recorder input acceptance", () => {
	const complete = [
		"The loop protocol requires the absolute path for a persisted session.",
		"That absolute path rule belongs to the loop protocol, while the record-verdict recorder itself accepts any readable relative path.",
	].join("\n\n");
	expect(sessionPathContractFailures("guide.md", complete)).toEqual([]);
	const recorderOnlyContrast = [
		"The loop protocol requires the absolute path for a persisted session.",
		"Unlike the loop protocol, the record-verdict recorder accepts any readable relative transcript path.",
	].join("\n\n");
	expect(sessionPathContractFailures("guide.md", recorderOnlyContrast)).toEqual([]);
	expect(sessionPathContractFailures("guide.md", "The recorder requires an absolute session path.")).toEqual([
		"guide.md: loop protocol must require an absolute persisted session path without optional or contradictory wording",
		"guide.md: recorder must explicitly distinguish its acceptance of a readable relative path from the loop protocol",
	]);
});

test("session path contract rejects optional protocol wording", () => {
	const optional = [
		"The loop protocol may use the absolute path for a persisted session when available.",
		"That absolute path rule belongs to the loop protocol, while the record-verdict recorder itself accepts any readable relative path.",
	].join("\n\n");
	expect(sessionPathContractFailures("optional.md", optional)).toContain(
		"optional.md: loop protocol must require an absolute persisted session path without optional or contradictory wording",
	);
});

test("session path contract rejects a mandatory assertion contradicted by relative loop input", () => {
	const contradictory = [
		"The loop protocol requires the absolute path for a persisted session. The loop session relative path is also accepted.",
		"That absolute path rule belongs to the loop protocol, while the record-verdict recorder itself accepts any readable relative path.",
	].join("\n\n");
	expect(sessionPathContractFailures("contradictory.md", contradictory)).toContain(
		"contradictory.md: loop protocol must require an absolute persisted session path without optional or contradictory wording",
	);
});

test("session path contract rejects recorder clauses that also permit relative loop input", () => {
	const failure = "same-clause.md: loop protocol must require an absolute persisted session path without optional or contradictory wording";
	const contradictions = [
		"The loop protocol requires the absolute path for a persisted session. The recorder accepts a readable relative session path that the loop permits.",
		"The loop protocol requires the absolute path for a persisted session. A readable relative session path that the protocol permits is accepted by the recorder.",
		"The loop protocol requires the absolute path for a persisted session. The record-verdict recorder accepts a readable relative transcript path the protocol allows.",
		"The loop protocol requires the absolute path for a persisted session. The recorder accepts a readable relative session path permitted under the protocol.",
		"The recorder accepts a readable relative session path that the loop permits. The loop protocol requires the absolute path for a persisted session.",
	];
	for (const contradiction of contradictions) {
		expect(sessionPathContractFailures("same-clause.md", contradiction)).toEqual([failure]);
	}
});

test("session path contract rejects coordinated recorder negation followed by loop acceptance", () => {
	const bypass = [
		"The loop protocol requires the absolute path for a persisted session.",
		"The record-verdict recorder accepts any readable relative transcript path.",
		"A relative session path is not accepted by the recorder but accepted by the loop protocol.",
	].join("\n\n");
	expect(sessionPathContractFailures("coordinated.md", bypass)).toEqual([
		"coordinated.md: loop protocol must require an absolute persisted session path without optional or contradictory wording",
	]);
});

const permissionStates = [
	{ name: "not recorder but loop", recorderAccepts: false, loopAccepts: true },
	{ name: "recorder but not loop", recorderAccepts: true, loopAccepts: false },
	{ name: "neither", recorderAccepts: false, loopAccepts: false },
	{ name: "both", recorderAccepts: true, loopAccepts: true },
];

for (const voice of ["active", "passive"] as const) {
	for (const conjunction of ["and", "but"] as const) {
		for (const order of ["recorder-first", "loop-first"] as const) {
			for (const state of permissionStates) {
				test(`session path permission matrix: ${state.name}, ${voice}, ${conjunction}, ${order}`, () => {
					const actors = order === "recorder-first" ? ["recorder", "loop"] as const : ["loop", "recorder"] as const;
					const accepts = (actor: "recorder" | "loop"): boolean =>
						actor === "recorder" ? state.recorderAccepts : state.loopAccepts;
					let coordinated: string;
					if (voice === "passive") {
						const predicate = (actor: "recorder" | "loop"): string =>
							`${accepts(actor) ? "" : "not "}accepted by the ${actor === "loop" ? "loop protocol" : "recorder"}`;
						coordinated = `A readable relative session path is ${predicate(actors[0])} ${conjunction} ${predicate(actors[1])}.`;
					} else {
						const predicate = (actor: "recorder" | "loop", object: string): string =>
							`The ${actor === "loop" ? "loop protocol" : "recorder"} ${accepts(actor) ? "accepts" : "does not accept"} ${object}`;
						coordinated = `${predicate(actors[0], "a readable relative transcript path")} ${conjunction} ${predicate(actors[1], "it")}.`;
					}
					const content = [
						"The loop protocol requires the absolute path for a persisted session.",
						"The record-verdict recorder accepts any readable relative transcript path.",
						coordinated,
					].join("\n\n");
					const expected = state.loopAccepts
						? ["matrix.md: loop protocol must require an absolute persisted session path without optional or contradictory wording"]
						: [];
					expect(sessionPathContractFailures("matrix.md", content)).toEqual(expected);
				});
			}
		}
	}
}

test("session path contract rejects cross-sentence relative permission outside the recorder boundary", () => {
	const fixture = read("tools/fixtures/contradictory-session-path.md");
	const failure = "fixture.md: loop protocol must require an absolute persisted session path without optional or contradictory wording";
	expect(sessionPathContractFailures("fixture.md", fixture)).toEqual([failure]);
	expect(sessionPathContractFailures("fixture.md", fixture.replace("relative session path", "relative transcript path"))).toEqual([
		failure,
	]);
	const mixedPermission = fixture.replace(
		"It also permits a relative session path.",
		"A relative session path is not accepted, and it also permits a relative transcript path.",
	);
	expect(sessionPathContractFailures("fixture.md", mixedPermission)).toEqual([failure]);

	const target = mkdtempSync(join(tmpdir(), "docs-session-contract-"));
	try {
		writeFileSync(join(target, "README.md"), fixture);
		expect(checkDocsContracts(target)).toEqual([
			"README.md: loop protocol must require an absolute persisted session path without optional or contradictory wording",
		]);
	} finally {
		rmSync(target, { recursive: true, force: true });
	}
});

test("session path contract allows recorder input and negative relative-path warnings in any order", () => {
	const warning = [
		"The record-verdict recorder accepts any readable relative transcript path.",
		"Warning: do not use a relative session path for the loop protocol.",
		"The loop protocol requires the absolute path for a persisted session.",
		"A relative transcript path is not accepted by the loop protocol.",
	].join("\n\n");
	expect(sessionPathContractFailures("warning.md", warning)).toEqual([]);
});

test("session path contract rejects optional or undiscriminated recorder wording", () => {
	const optionalRecorder = [
		"The loop protocol requires the absolute path for a persisted session.",
		"The record-verdict recorder may accept a readable relative path.",
	].join("\n\n");
	expect(sessionPathContractFailures("recorder.md", optionalRecorder)).toContain(
		"recorder.md: recorder must explicitly distinguish its acceptance of a readable relative path from the loop protocol",
	);
});

test("repository documentation contracts are clean", () => {
	expect(checkDocsContracts()).toEqual([]);
});

test("project installer ships a runnable documentation-contract checker", () => {
	const target = mkdtempSync(join(tmpdir(), "docs-contract-install-"));
	try {
		const install = Bun.spawnSync(["bash", "install.sh", "--here", target], {
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(install.exitCode).toBe(0);
		const installedTool = join(target, "tools", "check-doc-contracts.ts");
		expect(existsSync(installedTool)).toBe(true);
		const check = Bun.spawnSync(["bun", "tools/check-doc-contracts.ts"], {
			cwd: target,
			stdout: "pipe",
			stderr: "pipe",
		});
		expect(check.exitCode).toBe(0);
		expect(check.stdout.toString()).toContain("docs-contracts: clean");
	} finally {
		rmSync(target, { recursive: true, force: true });
	}
});
