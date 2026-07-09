/*
 * select-learnings -- deterministic retrieval engine for the scoped learnings store.
 *
 * Given the list of files a change touches, print the ACTIVE learnings whose scope glob
 * matches at least one of them -- and nothing else. This is the read-path the harness was
 * missing: AGENTS.md reaches every delegation unscoped; this hands the developer only the
 * past learnings that apply to THESE files.
 *
 * Selection is pure code -- no model call, no embeddings. It emits a trace (--trace) of
 * why each learning was selected or rejected; `just check-learnings` asserts against that
 * trace so the glob-targeting is tested, not assumed.
 *
 * This file lives in tools/ and runs via bun directly. It is NOT a pi extension, so it is
 * NOT subject to the pi tokenizer load-breakers -- normal TS (regex, backticks) is fine.
 *
 * Usage:
 *   git diff --name-only main | bun tools/select-learnings.ts
 *   bun tools/select-learnings.ts --trace -- path/a.ts path/b.ts
 *   bun tools/select-learnings.ts --dir learnings --cap 20
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const SCHEMA_VERSION = 1;

export type Learning = {
	id: string;
	type: string;
	scope: string[];
	tags: string[];
	severity: string;
	status: string;
	summary: string;
	source_change: string;
	source_commit: string;
	created: string;
	file: string;
};

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Parse the leading `---` YAML frontmatter block into a flat record. Supports inline
 *  scalars, inline `[a, b]` lists, and a nested `source:` block with indented keys. */
export function parseFrontmatter(text: string): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	if (!text.startsWith("---")) return out;
	const end = text.indexOf("\n---", 3);
	if (end === -1) return out;
	const block = text.slice(text.indexOf("\n") + 1, end);
	let currentParent: string | null = null;
	for (const rawLine of block.split("\n")) {
		if (rawLine.trim() === "") continue;
		const indented = /^\s+\S/.test(rawLine);
		const line = rawLine.trim();
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		let value = line.slice(colon + 1).trim();

		if (value === "" && !indented) {
			// A parent key like `source:` whose children are indented below.
			currentParent = key;
			out[key] = {};
			continue;
		}
		// Strip surrounding quotes.
		value = value.replace(/^["']|["']$/g, "");

		if (indented && currentParent) {
			(out[currentParent] as Record<string, unknown>)[key] = value;
			continue;
		}
		currentParent = null;

		if (value.startsWith("[") && value.endsWith("]")) {
			out[key] = value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim().replace(/^["']|["']$/g, ""))
				.filter((s) => s.length > 0);
		} else {
			out[key] = value;
		}
	}
	return out;
}

function asList(v: unknown): string[] {
	if (Array.isArray(v)) return v.map(String);
	if (typeof v === "string" && v.length > 0) return [v];
	return [];
}

export function loadLearnings(dir: string): Learning[] {
	if (!existsSync(dir)) return [];
	const out: Learning[] = [];
	for (const name of readdirSync(dir)) {
		if (!name.endsWith(".md")) continue;
		if (name.startsWith("_") || name === "README.md") continue; // template / docs
		const fm = parseFrontmatter(readFileSync(join(dir, name), "utf8"));
		const source = (fm.source ?? {}) as Record<string, unknown>;
		out.push({
			id: String(fm.id ?? name.replace(/\.md$/, "")),
			type: String(fm.type ?? "review-rule"),
			scope: asList(fm.scope),
			tags: asList(fm.tags),
			severity: String(fm.severity ?? "medium"),
			status: String(fm.status ?? "draft"),
			summary: String(fm.summary ?? ""),
			source_change: String(source.change ?? ""),
			source_commit: String(source.commit ?? ""),
			created: String(fm.created ?? ""),
			file: join(dir, name),
		});
	}
	return out;
}

/** Convert a forward-slash glob to an anchored RegExp. `**\/` spans path segments,
 *  `**` spans anything, `*` spans anything but a slash. Matches repo-relative paths;
 *  renames match on the new path (what `git diff --name-only` emits). */
export function globToRegExp(glob: string): RegExp {
	let re = "^";
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === "*") {
			if (glob[i + 1] === "*") {
				i++;
				if (glob[i + 1] === "/") {
					i++;
					re += "(?:.*/)?";
				} else {
					re += ".*";
				}
			} else {
				re += "[^/]*";
			}
		} else if (".+?^${}()|[]\\".indexOf(c) !== -1) {
			re += "\\" + c;
		} else {
			re += c;
		}
	}
	return new RegExp(re + "$");
}

export type SelectResult = { selected: Learning[]; trace: string[] };

/** Deterministic selection with a bounded, stable-ordered result. Ordering: severity
 *  desc, then created desc, then id asc -- so BRIEF cost is bounded and reproducible. */
export function selectLearnings(
	learnings: Learning[],
	changedFiles: string[],
	opts: { cap?: number } = {},
): SelectResult {
	const cap = opts.cap ?? 20;
	const trace: string[] = [];
	const matched: Learning[] = [];

	for (const l of learnings) {
		if (l.status !== "active") {
			trace.push("reject " + l.id + " status=" + l.status);
			continue;
		}
		let hit: string | null = null;
		for (const g of l.scope) {
			const rx = globToRegExp(g);
			const f = changedFiles.find((cf) => rx.test(cf));
			if (f) {
				hit = g + " matched " + f;
				break;
			}
		}
		if (hit) {
			trace.push("select " + l.id + " glob " + hit);
			matched.push(l);
		} else {
			trace.push("reject " + l.id + " no-scope-match");
		}
	}

	matched.sort((a, b) => {
		const s = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
		if (s !== 0) return s;
		if (a.created !== b.created) return a.created < b.created ? 1 : -1;
		return a.id < b.id ? -1 : 1;
	});

	const selected = matched.slice(0, cap);
	if (matched.length > cap) {
		trace.push("capped " + matched.length + " -> " + cap);
	}
	return { selected, trace };
}

export function render(selected: Learning[]): string {
	if (selected.length === 0) return "No relevant learnings for the changed files.";
	const lines = ["Relevant learnings (scoped to the changed files):", ""];
	for (const l of selected) {
		lines.push(
			"- [" + l.id + "] (" + l.type + ", " + l.severity + ") " + l.summary,
		);
		lines.push("      scope: " + l.scope.join(", ") + "  |  source: " + l.source_change);
	}
	return lines.join("\n");
}

async function readStdin(): Promise<string> {
	if (process.stdin.isTTY) return "";
	const chunks: Buffer[] = [];
	for await (const c of process.stdin) chunks.push(c as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

if (import.meta.main) {
	const argv = process.argv.slice(2);
	let dir = "learnings";
	let cap = 20;
	let showTrace = false;
	const files: string[] = [];
	let afterDD = false;
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (afterDD) { files.push(a); continue; }
		if (a === "--") afterDD = true;
		else if (a === "--trace") showTrace = true;
		else if (a === "--dir") dir = argv[++i];
		else if (a === "--cap") cap = Number(argv[++i]);
		else files.push(a);
	}
	if (files.length === 0) {
		const stdin = await readStdin();
		for (const line of stdin.split("\n")) {
			const t = line.trim();
			if (t) files.push(t);
		}
	}
	const learnings = loadLearnings(dir);
	const { selected, trace } = selectLearnings(learnings, files, { cap });
	if (showTrace) for (const t of trace) process.stderr.write("TRACE " + t + "\n");
	process.stdout.write(render(selected) + "\n");
	process.exit(0);
}
