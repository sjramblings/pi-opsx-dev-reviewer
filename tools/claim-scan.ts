/*
 * claim-scan.ts — specific claims added to docs must be backed by something else in the repo.
 *
 * Runs via bun; not a pi extension. Read-only.
 *
 * Whether a sentence is true has no oracle. Whether its specifics exist anywhere else is a
 * lookup. For every line a diff adds to a Markdown file (outside openspec/changes/), this
 * flags:
 *   - a version number (1.2.3) or a size or duration with a unit (64 GB, 250 ms) that appears
 *     in no other file in the repo, and
 *   - a backticked relative file path that does not exist.
 * An invented hardware spec or a renamed file both fail. The fix is to cite the file that
 * backs the claim, or drop the claim.
 *
 * Ported idea: pi-rukas claim-scan.ts (Apache-2.0). No code copied.
 *
 * usage: bun tools/claim-scan.ts [--base <ref>]
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { resolveBase } from "./diff-gate.ts";

const VERSION = /\bv?(\d+\.\d+\.\d+)\b/g;
const QUANTITY = /\b(\d+(?:\.\d+)?)\s?(KB|MB|GB|TB|KiB|MiB|GiB|TiB|ms)\b/g;
const CODE_SPAN = /`([^`\n]+)`/g;
const RELATIVE_PATH = /^(?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+\.[A-Za-z0-9]+$/;
const TEXT_EXTENSIONS = [".md", ".ts", ".js", ".sh", ".yaml", ".yml", ".json", ".html", ".txt", ".toml"];
const SKIPPED_PREFIXES = ["node_modules/", "tools/vendor/", ".git/"];

export type ClaimFinding = { file: string; line: number; token: string; kind: "unbacked" | "missing-path" };
export type AddedLine = { file: string; line: number; text: string };

export function isScannedDoc(path: string): boolean {
	return path.endsWith(".md") && !path.startsWith("openspec/changes/") && !/(^|\/)CHANGELOG\.md$/.test(path);
}

/** Version and quantity tokens in one line of prose. Inline code is left in: a version in code is still a claim. */
export function factTokens(text: string): { token: string; pattern: RegExp }[] {
	const out: { token: string; pattern: RegExp }[] = [];
	for (const m of text.matchAll(VERSION)) {
		const v = m[1] ?? "";
		out.push({ token: v, pattern: new RegExp(`(^|[^\\d.])${v.replace(/\./g, "\\.")}($|[^\\d])`) });
	}
	for (const m of text.matchAll(QUANTITY)) {
		const [n, unit] = [m[1] ?? "", m[2] ?? ""];
		out.push({ token: `${n} ${unit}`, pattern: new RegExp(`(^|[^\\d.])${n.replace(/\./g, "\\.")}\\s?${unit}\\b`) });
	}
	return out;
}

/** Backticked relative file paths in one line. */
export function pathTokens(text: string): string[] {
	const out: string[] = [];
	for (const m of text.matchAll(CODE_SPAN)) {
		const span = (m[1] ?? "").trim();
		if (RELATIVE_PATH.test(span)) out.push(span);
	}
	return out;
}

export function scanClaims(
	added: AddedLine[],
	corpus: Map<string, string>,
	pathExists: (p: string) => boolean,
): ClaimFinding[] {
	const findings: ClaimFinding[] = [];
	for (const line of added) {
		if (!isScannedDoc(line.file)) continue;
		for (const { token, pattern } of factTokens(line.text)) {
			let backed = false;
			for (const [path, text] of corpus) {
				if (path !== line.file && pattern.test(text)) {
					backed = true;
					break;
				}
			}
			if (!backed) findings.push({ file: line.file, line: line.line, token, kind: "unbacked" });
		}
		for (const p of pathTokens(line.text)) {
			const fromRoot = normalize(p);
			const fromDoc = normalize(join(dirname(line.file), p));
			// A path that resolves outside the repository is not a repo claim; never probe it.
			if (fromRoot.startsWith("..") && fromDoc.startsWith("..")) continue;
			if (!pathExists(fromRoot) && !pathExists(fromDoc)) {
				findings.push({ file: line.file, line: line.line, token: p, kind: "missing-path" });
			}
		}
	}
	return findings;
}

/** Added lines per file from a -U0 unified diff, with their new-file line numbers. */
export function addedLines(unifiedDiff: string): AddedLine[] {
	const out: AddedLine[] = [];
	let file: string | null = null;
	let next = 0;
	for (const raw of unifiedDiff.split(/\r?\n/)) {
		if (raw.startsWith("+++ ")) {
			const t = raw.slice(4);
			file = t === "/dev/null" ? null : t.replace(/^b\//, "");
			continue;
		}
		const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
		if (hunk) {
			next = Number(hunk[1]);
			continue;
		}
		if (file === null || raw.startsWith("--- ")) continue;
		if (raw.startsWith("+")) {
			out.push({ file, line: next, text: raw.slice(1) });
			next++;
		}
	}
	return out;
}

function git(args: string[]): { ok: boolean; out: string } {
	const run = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
	return { ok: run.exitCode === 0, out: run.stdout.toString() };
}

function isFile(path: string): boolean {
	return existsSync(path) && lstatSync(path).isFile();
}

if (import.meta.main) {
	try {
		const argv = process.argv.slice(2);
		if (argv.length !== 0 && !(argv.length === 2 && argv[0] === "--base")) {
			throw new Error("claim-scan: usage: claim-scan [--base <ref>]");
		}
		const base = resolveBase(argv[1], "claim-scan");
		const tracked = git(["diff", "--no-color", "--no-ext-diff", "-U0", base, "--", "*.md"]);
		if (!tracked.ok) throw new Error(`claim-scan: git diff ${base} failed`);
		const untracked = git(["ls-files", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean);
		const added = addedLines(tracked.out);
		for (const path of untracked.filter((p) => p.endsWith(".md") && isFile(p))) {
			readFileSync(path, "utf8")
				.split(/\r?\n/)
				.forEach((text, i) => added.push({ file: path, line: i + 1, text }));
		}

		const corpus = new Map<string, string>();
		const all = [...git(["ls-files"]).out.split("\n"), ...untracked].filter(Boolean);
		for (const path of all) {
			if (SKIPPED_PREFIXES.some((p) => path.startsWith(p))) continue;
			if (!TEXT_EXTENSIONS.some((e) => path.endsWith(e)) || !isFile(path)) continue;
			corpus.set(path, readFileSync(path, "utf8"));
		}

		const findings = scanClaims(added, corpus, (p) => existsSync(p));
		for (const f of findings) {
			const why = f.kind === "unbacked" ? "appears in no other file" : "does not exist";
			console.log(`claim-scan: ${f.file}:${f.line} ${f.kind === "unbacked" ? "claim" : "path"} "${f.token}" ${why}`);
		}
		const scanned = added.filter((l) => isScannedDoc(l.file)).length;
		console.log(`claim-scan: ${findings.length === 0 ? "clean" : "FAIL"} (${scanned} added doc line(s) scanned)`);
		process.exit(findings.length === 0 ? 0 : 1);
	} catch (error: unknown) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(2);
	}
}
