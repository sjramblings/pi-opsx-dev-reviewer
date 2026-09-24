import { expect, test } from "bun:test";
import { join } from "node:path";
import {
	canonicalVersion,
	checkRepo,
	claimFindings,
	compareVersions,
	installedNote,
	isScanned,
} from "./pi-compat.ts";

const repoRoot = join(import.meta.dir, "..");

test("the real repository has one canonical line and no contradicting claim", () => {
	const { canonical, findings } = checkRepo(repoRoot);
	expect(canonical.version).toMatch(/^\d+\.\d+\.\d+$/);
	expect(findings).toEqual([]);
});

test("a disagreeing verified-against claim is reported with its location", () => {
	const findings = claimFindings(
		[{ path: "README.md", text: "intro\nThis kit was tested with pi 0.79.9 last month.\n" }],
		"0.83.0",
	);
	expect(findings).toEqual([
		{ path: "README.md", line: 2, version: "0.79.9", text: "This kit was tested with pi 0.79.9 last month." },
	]);
});

test("claim wording variants are all recognised", () => {
	const text = ["Verified against pi 0.1.0", "verified on pi v0.2.0", "tested against pi 0.3.0"].join("\n");
	expect(claimFindings([{ path: "x.md", text }], "9.9.9").map((f) => f.version)).toEqual([
		"0.1.0",
		"0.2.0",
		"0.3.0",
	]);
});

test("an agreeing claim and dated history are not reported", () => {
	const text = [
		"Verified against pi 0.83.0 on the laptop.",
		"The shakedown was run against pi 0.79.9 on 2026-07-08.",
		"pi 0.79.9 has a fragile extension tokenizer.",
	].join("\n");
	expect(claimFindings([{ path: "SHAKEDOWN.md", text }], "0.83.0")).toEqual([]);
});

test("the canonical line must appear exactly once", () => {
	expect(canonicalVersion("# x\n\n## Last verified against pi 1.2.3 (2026-01-02)\n")).toEqual({
		version: "1.2.3",
		date: "2026-01-02",
	});
	expect(() => canonicalVersion("# nothing here\n")).toThrow("found 0");
	const twice = "## Last verified against pi 1.0.0 (2026-01-01)\n## Last verified against pi 2.0.0 (2026-02-02)\n";
	expect(() => canonicalVersion(twice)).toThrow("found 2");
});

test("openspec, vendored code, and the canonical doc are not scanned", () => {
	expect(isScanned("README.md")).toBe(true);
	expect(isScanned("tools/record-verdict.ts")).toBe(true);
	expect(isScanned("openspec/changes/add-x/specs/y/spec.md")).toBe(false);
	expect(isScanned("docs/pi-compatibility.md")).toBe(false);
	expect(isScanned("tools/vendor/x/index.js")).toBe(false);
	expect(isScanned("assets/logo.png")).toBe(false);
});

test("the installed version is compared, never failed", () => {
	expect(compareVersions("0.84.4", "0.83.0")).toBe(1);
	expect(compareVersions("0.83.0", "0.83.0")).toBe(0);
	expect(compareVersions("0.9.0", "0.83.0")).toBe(-1);
	expect(installedNote("0.83.0", "0.84.4")).toContain("NEWER");
	expect(installedNote("0.83.0", "0.80.10")).toContain("OLDER");
	expect(installedNote("0.83.0", "0.83.0")).toContain("matches");
	expect(installedNote("0.83.0", null)).toContain("not installed");
});

test("CLI exits 0 on the real repository", () => {
	const run = Bun.spawnSync(["bun", join(import.meta.dir, "pi-compat.ts")], { cwd: repoRoot });
	expect(run.exitCode).toBe(0);
	expect(run.stdout.toString()).toContain("pi-compat: last verified against pi ");
});
