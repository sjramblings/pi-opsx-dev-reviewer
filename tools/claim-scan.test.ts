import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addedLines, factTokens, isScannedDoc, pathTokens, scanClaims } from "./claim-scan.ts";

const line = (text: string, file = "README.md", n = 1) => ({ file, line: n, text });
const exists = (known: string[]) => (p: string) => known.includes(p);

test("an invented size is flagged", () => {
	const corpus = new Map([["README.md", "requires 64 GB RAM"], ["docs/x.md", "nothing here"]]);
	expect(scanClaims([line("requires 64 GB RAM")], corpus, exists([]))).toEqual([
		{ file: "README.md", line: 1, token: "64 GB", kind: "unbacked" },
	]);
});

test("a size is backed with or without the space", () => {
	const corpus = new Map([["README.md", ""], ["docs/spec.md", "the box has 64GB of memory"]]);
	expect(scanClaims([line("requires 64 GB RAM")], corpus, exists([]))).toEqual([]);
});

test("a backed version passes and an unbacked one is flagged", () => {
	const corpus = new Map([["README.md", ""], ["SHAKEDOWN.md", "ran against pi 0.83.0"]]);
	expect(scanClaims([line("verified on pi 0.83.0")], corpus, exists([]))).toEqual([]);
	expect(scanClaims([line("verified on pi 0.99.1")], corpus, exists([]))[0]?.token).toBe("0.99.1");
});

test("a version is not backed by a longer number that contains it", () => {
	const corpus = new Map([["README.md", ""], ["x.json", "version 10.83.0.4"]]);
	expect(scanClaims([line("pi 0.83.0")], corpus, exists([]))).toHaveLength(1);
});

test("a missing backticked path is flagged and an existing one passes", () => {
	const corpus = new Map([["README.md", ""]]);
	expect(scanClaims([line("see `tools/nope.ts`")], corpus, exists([]))).toEqual([
		{ file: "README.md", line: 1, token: "tools/nope.ts", kind: "missing-path" },
	]);
	expect(scanClaims([line("see `tools/real.ts`")], corpus, exists(["tools/real.ts"]))).toEqual([]);
});

test("a path relative to the doc resolves", () => {
	const corpus = new Map([["docs/a.md", ""]]);
	expect(scanClaims([line("see `../SHAKEDOWN.md`", "docs/a.md")], corpus, exists(["SHAKEDOWN.md"]))).toEqual([]);
});

test("a path that resolves outside the repository is not probed", () => {
	const corpus = new Map([["README.md", ""]]);
	let probed = 0;
	const spy = (p: string) => {
		probed++;
		return p === "never";
	};
	expect(scanClaims([line("see `../../../etc/hosts.x`")], corpus, spy)).toEqual([]);
	expect(probed).toBe(0);
});

test("non-path code spans and placeholders are ignored", () => {
	expect(pathTokens("run `just diff-gate` then `bun test` in `<repo>/x/y.ts` or `tools/*.ts`")).toEqual([]);
	expect(pathTokens("see `tools/diff-gate.ts` and `./docs/a.md`")).toEqual(["tools/diff-gate.ts", "./docs/a.md"]);
});

test("change folders and changelogs are not scanned", () => {
	expect(isScannedDoc("README.md")).toBe(true);
	expect(isScannedDoc("docs/pi-compatibility.md")).toBe(true);
	expect(isScannedDoc("openspec/changes/add-x/design.md")).toBe(false);
	expect(isScannedDoc("CHANGELOG.md")).toBe(false);
	expect(isScannedDoc("tools/a.ts")).toBe(false);
});

test("fact tokens find versions and quantities", () => {
	expect(factTokens("pi v0.83.0 took 250 ms on a 1.5 GiB box").map((t) => t.token)).toEqual([
		"0.83.0",
		"250 ms",
		"1.5 GiB",
	]);
});

test("added lines carry new-file line numbers", () => {
	const diff = ["--- a/README.md", "+++ b/README.md", "@@ -10,0 +11,2 @@", "+one", "+two", "@@ -20 +22 @@", "-old", "+three"].join("\n");
	expect(addedLines(diff)).toEqual([
		{ file: "README.md", line: 11, text: "one" },
		{ file: "README.md", line: 12, text: "two" },
		{ file: "README.md", line: 22, text: "three" },
	]);
});

test("CLI end to end: flags an invented claim in a committed-then-edited doc", () => {
	const root = mkdtempSync(join(tmpdir(), "claim-scan-test-"));
	const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
	const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: root, env });
	const run = (args: string[]) => Bun.spawnSync(["bun", join(import.meta.dir, "claim-scan.ts"), ...args], { cwd: root });
	try {
		git("init", "-q", "-b", "main");
		mkdirSync(join(root, "docs"));
		writeFileSync(join(root, "README.md"), "# Readme\n");
		writeFileSync(join(root, "docs", "facts.md"), "Built with bun 1.3.9.\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");
		expect(run(["--base", "main"]).exitCode).toBe(0);

		writeFileSync(join(root, "README.md"), "# Readme\n\nNeeds bun 1.3.9 and 64 GB RAM. See `docs/facts.md`.\n");
		const out = run(["--base", "main"]);
		expect(out.exitCode).toBe(1);
		expect(out.stdout.toString()).toContain('README.md:3 claim "64 GB" appears in no other file');
		expect(out.stdout.toString()).not.toContain('"1.3.9"');
		expect(run(["--nope"]).exitCode).toBe(2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a --base that looks like a git option is refused and writes nothing", () => {
	const root = mkdtempSync(join(tmpdir(), "claim-scan-inject-"));
	const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
	const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: root, env });
	const run = (args: string[]) => Bun.spawnSync(["bun", join(import.meta.dir, "claim-scan.ts"), ...args], { cwd: root });
	try {
		git("init", "-q", "-b", "main");
		writeFileSync(join(root, "README.md"), "a\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");
		writeFileSync(join(root, "README.md"), "b\n");
		expect(run(["--base", "--output=pwned.txt"]).exitCode).toBe(2);
		expect(Bun.file(join(root, "pwned.txt")).size).toBe(0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
