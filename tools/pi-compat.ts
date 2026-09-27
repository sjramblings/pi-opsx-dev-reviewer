/*
 * pi-compat.ts — one Pi version claim, and a check that nothing contradicts it.
 *
 * Runs via bun; not a pi extension. Kit-only (the recipe lives in the root justfile).
 *
 * docs/pi-compatibility.md carries the single "Last verified against pi X.Y.Z (date)" line.
 * Any other tracked file that says something was verified or tested against, with, or on a
 * specific pi version must name that version. Dated history such as "run against pi 0.79.9"
 * is not a claim. openspec/ and *.test.ts are skipped: they quote versions as examples.
 *
 * It also prints the installed `pi --version` next to the canonical line. A difference is
 * reported, never failed: the line is a fallback, not a ceiling.
 *
 * Ported idea: pi-rukas docs/pi-compatibility.md and its version-drift gate (Apache-2.0).
 *
 * usage: bun tools/pi-compat.ts
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";

export const CANONICAL_DOC = "docs/pi-compatibility.md";

const CANONICAL_LINE = /^## Last verified against pi (\d+\.\d+\.\d+) \((\d{4}-\d{2}-\d{2})\)$/gm;
const CLAIM = /\b(?:verified|tested)\s+(?:against|with|on)\s+pi\s+v?(\d+\.\d+(?:\.\d+)?)\b/gi;
const SCANNED_EXTENSIONS = [".md", ".ts", ".sh", ".yaml", ".yml", ".json", ".html"];
const SKIPPED_PREFIXES = ["openspec/", "node_modules/", "tools/vendor/"];
const SKIPPED_FILES = new Set([CANONICAL_DOC, "tools/pi-compat.ts", "tools/pi-compat.test.ts"]);

export type Canonical = { version: string; date: string };

export function canonicalVersion(doc: string): Canonical {
	const matches = [...doc.matchAll(CANONICAL_LINE)];
	if (matches.length !== 1) {
		throw new Error(
			`pi-compat: ${CANONICAL_DOC} must contain exactly one "## Last verified against pi X.Y.Z (YYYY-MM-DD)" line, found ${matches.length}`,
		);
	}
	return { version: matches[0]?.[1] ?? "", date: matches[0]?.[2] ?? "" };
}

export type DriftFinding = { path: string; line: number; version: string; text: string };

export function claimFindings(files: { path: string; text: string }[], canonical: string): DriftFinding[] {
	const findings: DriftFinding[] = [];
	for (const file of files) {
		const lines = file.text.split(/\r?\n/);
		lines.forEach((text, index) => {
			for (const match of text.matchAll(CLAIM)) {
				const version = match[1] ?? "";
				if (version !== canonical) findings.push({ path: file.path, line: index + 1, version, text: text.trim() });
			}
		});
	}
	return findings;
}

export function isScanned(path: string): boolean {
	if (SKIPPED_FILES.has(path)) return false;
	// Test fixtures quote example claims on purpose; they are not claims about this kit.
	if (path.endsWith(".test.ts")) return false;
	if (SKIPPED_PREFIXES.some((p) => path.startsWith(p))) return false;
	return SCANNED_EXTENSIONS.some((ext) => path.endsWith(ext));
}

function gitList(args: string[], cwd: string): string[] {
	const run = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	if (run.exitCode !== 0) throw new Error(`pi-compat: git ${args.join(" ")} failed`);
	return run.stdout.toString().split("\n").filter(Boolean);
}

/** Scan the repo at root; returns the canonical version and any contradicting claims. */
export function checkRepo(root: string = process.cwd()): { canonical: Canonical; findings: DriftFinding[] } {
	const canonical = canonicalVersion(readFileSync(`${root}/${CANONICAL_DOC}`, "utf8"));
	const paths = [
		...gitList(["ls-files"], root),
		...gitList(["ls-files", "--others", "--exclude-standard"], root),
	].filter(isScanned);
	const files = paths
		.filter((p) => existsSync(`${root}/${p}`) && lstatSync(`${root}/${p}`).isFile())
		.map((p) => ({ path: p, text: readFileSync(`${root}/${p}`, "utf8") }));
	return { canonical, findings: claimFindings(files, canonical.version) };
}

function parts(v: string): number[] {
	return v.split(".").map((n) => Number(n));
}

export function compareVersions(a: string, b: string): number {
	const pa = parts(a);
	const pb = parts(b);
	for (let i = 0; i < 3; i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d !== 0) return d < 0 ? -1 : 1;
	}
	return 0;
}

export function installedNote(canonical: string, installed: string | null): string {
	if (installed === null) return `pi-compat: pi is not installed; last verified against ${canonical}.`;
	const cmp = compareVersions(installed, canonical);
	if (cmp === 0) return `pi-compat: installed pi ${installed} matches the last verified version.`;
	if (cmp > 0) {
		return `pi-compat: installed pi ${installed} is NEWER than the last verified ${canonical}. It may work; before relying on it, run a live shakedown and bump ${CANONICAL_DOC}.`;
	}
	return `pi-compat: installed pi ${installed} is OLDER than the last verified ${canonical}. If something breaks, upgrade to ${canonical}.`;
}

function installedPi(): string | null {
	try {
		const run = Bun.spawnSync(["pi", "--version"], { stdout: "pipe", stderr: "pipe" });
		const match = /(\d+\.\d+\.\d+)/.exec(`${run.stdout.toString()} ${run.stderr.toString()}`);
		return run.exitCode === 0 && match ? (match[1] ?? null) : null;
	} catch (spawnError: unknown) {
		void spawnError;
		return null;
	}
}

if (import.meta.main) {
	try {
		const { canonical, findings } = checkRepo();
		console.log(`pi-compat: last verified against pi ${canonical.version} (${canonical.date}), per ${CANONICAL_DOC}.`);
		console.log(installedNote(canonical.version, installedPi()));
		for (const f of findings) {
			console.log(`pi-compat: DRIFT ${f.path}:${f.line} claims pi ${f.version}: ${f.text}`);
		}
		if (findings.length > 0) {
			console.log(`pi-compat: FAIL -- ${findings.length} claim(s) disagree with ${CANONICAL_DOC}.`);
			process.exit(1);
		}
	} catch (error: unknown) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
