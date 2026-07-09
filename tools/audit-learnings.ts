/*
 * audit-learnings -- provenance + schema integrity gate for the learnings store.
 *
 * Fails (exit 1) if any learning is missing a required frontmatter field, carries an
 * unknown status, or -- for an ACTIVE learning -- names a source.change that does not
 * resolve to a real change folder (live or archived). Provenance is checked as an
 * immutable pointer (change folder + commit), never a line number.
 *
 * Runs via bun; not a pi extension, so normal TS is fine.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "./select-learnings.ts";

const DIR = "learnings";
const VALID_STATUS = new Set(["draft", "active", "retired", "superseded"]);
const VALID_TYPE = new Set(["bug-class", "review-rule", "research-note", "decision"]);
const REQUIRED = ["schema_version", "id", "type", "scope", "status", "summary", "created"];

function changeResolves(change: string): boolean {
	if (!change) return false;
	return (
		existsSync(join("openspec", "changes", change)) ||
		existsSync(join("openspec", "changes", "archive", change))
	);
}

let failures = 0;
function fail(file: string, msg: string): void {
	console.error("  " + file + ": " + msg);
	failures++;
}

if (!existsSync(DIR)) {
	console.log("learnings-audit: no learnings/ directory yet — nothing to audit.");
	process.exit(0);
}

let checked = 0;
for (const name of readdirSync(DIR)) {
	if (!name.endsWith(".md")) continue;
	if (name.startsWith("_") || name === "README.md") continue;
	checked++;
	const fm = parseFrontmatter(readFileSync(join(DIR, name), "utf8"));

	for (const key of REQUIRED) {
		const v = fm[key];
		const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
		if (empty) fail(name, "missing required field: " + key);
	}
	if (fm.status !== undefined && !VALID_STATUS.has(String(fm.status)))
		fail(name, "invalid status: " + String(fm.status));
	if (fm.type !== undefined && !VALID_TYPE.has(String(fm.type)))
		fail(name, "invalid type: " + String(fm.type));

	const source = (fm.source ?? {}) as Record<string, unknown>;
	const change = String(source.change ?? "");
	const commit = String(source.commit ?? "");
	if (String(fm.status) === "active") {
		if (!commit) fail(name, "active learning has no source.commit (immutable provenance)");
		if (!changeResolves(change))
			fail(name, "active learning source.change does not resolve to a change folder: " + change);
	}
}

if (failures > 0) {
	console.error("learnings-audit: FAIL — " + failures + " problem(s) across " + checked + " learning(s).");
	process.exit(1);
}
console.log("learnings-audit: " + checked + " learning(s) valid (schema + provenance).");
process.exit(0);
