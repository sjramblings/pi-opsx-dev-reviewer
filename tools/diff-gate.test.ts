import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	countMarkers,
	declaredMatches,
	falselyGreen,
	isSourcePath,
	skipRatchet,
} from "./diff-gate.ts";

function diffFor(file: string, lines: string[]): string {
	return [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, "@@ -1 +1 @@", ...lines].join("\n");
}

test("an added skip fails and names the file", () => {
	const findings = skipRatchet(diffFor("src/a.test.ts", ['+it.skip("x", () => {});']));
	expect(findings).toHaveLength(1);
	expect(findings[0]?.file).toBe("src/a.test.ts");
	expect(findings[0]?.added).toBe(1);
});

test("an added focus marker fails", () => {
	expect(skipRatchet(diffFor("a.test.ts", ['+describe.only("x", () => {});']))).toHaveLength(1);
	expect(skipRatchet(diffFor("lib.rs", ["+#[ignore]"]))).toHaveLength(1);
	expect(skipRatchet(diffFor("t.py", ["+@pytest.mark.skip(reason=1)"]))).toHaveLength(1);
});

test("a moved skip passes", () => {
	const diff = diffFor("a.test.ts", ['-it.skip("old", () => {});', '+it.skip("new", () => {});']);
	expect(skipRatchet(diff)).toEqual([]);
});

test("removing a skip passes", () => {
	expect(skipRatchet(diffFor("a.test.ts", ['-it.skip("x", () => {});', '+it("x", () => {});']))).toEqual([]);
});

test("markers inside string literals do not count", () => {
	expect(countMarkers('const m = "it.skip(";')).toBe(0);
	expect(countMarkers("const m = 'describe.only(';")).toBe(0);
	expect(countMarkers("const m = `#[ignore]`;")).toBe(0);
	expect(countMarkers('const m = "a \\" it.skip(";')).toBe(0);
	expect(skipRatchet(diffFor("a.ts", ['+const markers = ["it.skip(", ".only("];']))).toEqual([]);
});

test("comment lines do not count", () => {
	expect(countMarkers("// it.skip( is banned here")).toBe(0);
	expect(countMarkers(" * use test.only( sparingly")).toBe(0);
	expect(countMarkers("# pytest: @pytest.mark.skip is banned")).toBe(0);
});

test("a bare-word marker is not the tail of a longer identifier", () => {
	expect(countMarkers("process.exit(1);")).toBe(0);
	expect(countMarkers("xit(\"pending\", () => {});")).toBe(1);
	expect(countMarkers("foo.xtest(1)")).toBe(0);
});

test("a deleted file contributes no findings", () => {
	const diff = ["diff --git a/a.test.ts b/a.test.ts", "--- a/a.test.ts", "+++ /dev/null", '-it.skip("x", () => {});'].join("\n");
	expect(skipRatchet(diff)).toEqual([]);
});

const tasksMd = [
	"# Tasks",
	"",
	"## 1. Group",
	"",
	"- [x] 1.1 Build the tool.",
	"      files: `tools/a.ts`, `tools/a.test.ts`",
	"      probe: `bun test`",
	"",
	"- [x] 1.2 Document it.",
	"      files: `README.md`",
	"      probe: lint",
	"",
	"- [ ] 1.3 Not started.",
	"      files: `tools/b.ts`",
	"",
	"- [x] 1.4 Either file.",
	"      files: `install.sh` (or `tools/provision.sh`)",
].join("\n");

test("a ticked task whose declared source files are unchanged is falsely green", () => {
	const findings = falselyGreen(tasksMd, ["install.sh"]);
	expect(findings.map((f) => f.taskId)).toEqual(["1.1"]);
	expect(findings[0]?.declared).toEqual(["tools/a.ts", "tools/a.test.ts"]);
});

test("a ticked task with any declared path changed passes", () => {
	expect(falselyGreen(tasksMd, ["tools/a.test.ts", "install.sh"])).toEqual([]);
	expect(falselyGreen(tasksMd, ["tools/a.ts", "tools/provision.sh"])).toEqual([]);
});

test("docs-only and unticked tasks are exempt", () => {
	const ids = falselyGreen(tasksMd, []).map((f) => f.taskId);
	expect(ids).not.toContain("1.2");
	expect(ids).not.toContain("1.3");
	expect(ids).toEqual(["1.1", "1.4"]);
});

test("source classification and path matching", () => {
	expect(isSourcePath("tools/a.ts")).toBe(true);
	expect(isSourcePath("justfile.opsx")).toBe(true);
	expect(isSourcePath("README.md")).toBe(false);
	expect(isSourcePath("openspec/config.yaml")).toBe(false);
	expect(declaredMatches("extensions/", "extensions/x/index.ts")).toBe(true);
	expect(declaredMatches("extensions/*/index.ts", "extensions/x/index.ts")).toBe(true);
	expect(declaredMatches("extensions/*/index.ts", "extensions/x/y/index.ts")).toBe(false);
	expect(declaredMatches("extensions/repeat-call-detector", "extensions/repeat-call-detector/index.ts")).toBe(true);
	expect(declaredMatches("tools/a.ts", "tools/a.tsx")).toBe(false);
});

test("CLI end to end: fails on a committed skip and a falsely green task, passes when clean", () => {
	const root = mkdtempSync(join(tmpdir(), "diff-gate-test-"));
	const tool = join(import.meta.dir, "diff-gate.ts");
	const run = (args: string[]) => Bun.spawnSync(["bun", tool, ...args], { cwd: root });
	const git = (...args: string[]) =>
		Bun.spawnSync(["git", ...args], { cwd: root, env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });
	try {
		git("init", "-q", "-b", "main");
		writeFileSync(join(root, "a.test.ts"), 'it("x", () => {});\n');
		git("add", "-A");
		git("commit", "-q", "-m", "base");
		const clean = run(["--base", "main"]);
		expect(clean.exitCode).toBe(0);
		expect(clean.stdout.toString()).toContain("diff-gate: clean");

		writeFileSync(join(root, "a.test.ts"), 'it.skip("x", () => {});\n');
		const skipped = run(["--base", "main"]);
		expect(skipped.exitCode).toBe(1);
		expect(skipped.stdout.toString()).toContain("skip ratchet -- a.test.ts");

		writeFileSync(join(root, "a.test.ts"), 'it("x", () => {});\n');
		mkdirSync(join(root, "openspec", "changes", "c"), { recursive: true });
		writeFileSync(join(root, "openspec", "changes", "c", "tasks.md"), "- [x] 1.1 Do it.\n      files: `tools/x.ts`\n");
		const green = run(["--base", "main", "--change", "c"]);
		expect(green.exitCode).toBe(1);
		expect(green.stdout.toString()).toContain("task 1.1 is ticked but none of its declared files changed");

		expect(run(["--bogus"]).exitCode).toBe(2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("a --base that looks like a git option is refused and writes nothing", () => {
	const root = mkdtempSync(join(tmpdir(), "diff-gate-inject-"));
	const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
	const git = (...args: string[]) => Bun.spawnSync(["git", ...args], { cwd: root, env });
	const run = (args: string[]) => Bun.spawnSync(["bun", join(import.meta.dir, "diff-gate.ts"), ...args], { cwd: root });
	try {
		git("init", "-q", "-b", "main");
		writeFileSync(join(root, "a.txt"), "a\n");
		git("add", "-A");
		git("commit", "-q", "-m", "base");
		writeFileSync(join(root, "a.txt"), "b\n");
		const injected = run(["--base", "--output=pwned.txt"]);
		expect(injected.exitCode).toBe(2);
		expect(Bun.file(join(root, "pwned.txt")).size).toBe(0);
		expect(run(["--base", "no-such-ref"]).exitCode).toBe(2);
		expect(run(["--base", "main", "--change", "../x"]).exitCode).toBe(2);
		expect(run(["--base", "main"]).exitCode).toBe(0);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
