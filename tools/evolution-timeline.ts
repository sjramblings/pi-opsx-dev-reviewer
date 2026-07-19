#!/usr/bin/env bun
// Architecture-evolution timeline generator.
//
// Reads an OpenSpec repo's change log (openspec/changes + archive), current specs
// (openspec/specs), and git history, and renders a self-contained interactive HTML
// timeline. The extraction and the thesis are pure functions of repo state; a model may
// override only the hero thesis via a supplied thesis file, and never any count.
//
// Usage:
//   bun tools/evolution-timeline.ts [repo] [--out <file>] [--thesis <file>] [--json]
//
// Defaults: repo=".", out="<repo>/architecture-evolution.html".
//
// Regex literals are fine here: the no-regex-literal rule exists for extensions/*/index.ts
// (the pi tokenizer), not for tools/.

import { readdirSync, readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { join, basename, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { inlineTheme } from "./lib/theme.ts";

// ---------- types ----------

export interface Requirement { op: string; title: string; scenarios: string[]; }
export interface Capability { name: string; requirements: Requirement[]; }
export interface Tasks { done: number; total: number; }
export interface Change {
  id: string; title: string; why: string; what: string;
  archived: boolean; committed: boolean; date: string;
  capabilities: Capability[]; tasks: Tasks;
  hasDesign: boolean; hasProbes: boolean;
  reqCount: number; scenarioCount: number;
}
export interface Thesis { headline: string; subhead: string; }
export interface Model {
  repo: string; generated: string; thesis: Thesis;
  changes: Change[]; capabilityCount: number;
  totals: { changes: number; requirements: number; scenarios: number;
    tasksDone: number; tasksTotal: number; archived: number };
}

// ---------- pure parsers ----------

/** Parse an OpenSpec spec-delta markdown into requirements with their operation. */
export function parseDelta(md: string): Requirement[] {
  const reqs: Requirement[] = [];
  let op = "ADDED";
  let cur: Requirement | null = null;
  for (const line of md.split("\n")) {
    const opM = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/i);
    if (opM) { op = opM[1].toUpperCase(); continue; }
    const rM = line.match(/^###\s+Requirement:\s*(.+?)\s*$/);
    if (rM) { cur = { op, title: rM[1], scenarios: [] }; reqs.push(cur); continue; }
    const sM = line.match(/^####\s+Scenario:\s*(.+?)\s*$/);
    if (sM && cur) cur.scenarios.push(sM[1]);
  }
  return reqs;
}

/** Count checked and total checkbox tasks in a tasks.md body. */
export function parseTasks(md: string): Tasks {
  const done = (md.match(/^\s*-\s*\[x\]/gim) ?? []).length;
  const todo = (md.match(/^\s*-\s*\[ \]/gim) ?? []).length;
  return { done, total: done + todo };
}

/** Extract a `## <heading>` section body from a proposal-style markdown. */
export function section(md: string, heading: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inSec = false;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      inSec = new RegExp(`^##\\s+${heading}\\s*$`, "i").test(line);
      continue;
    }
    if (inSec) out.push(line);
  }
  return out.join("\n").trim();
}

/** Compute the hero thesis from the model alone, using mechanical patterns. */
export function computeThesis(m: {
  changes: Change[];
  totals: { changes: number; requirements: number; scenarios: number; archived: number };
  capabilityCount: number;
}): Thesis {
  const { changes, requirements, scenarios, archived } = m.totals;
  const words = (n: number): string =>
    ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ??
    String(n);
  const allOps = m.changes.flatMap((c) =>
    c.capabilities.flatMap((cap) => cap.requirements.map((r) => r.op)));
  const allAdded = allOps.length > 0 && allOps.every((o) => o === "ADDED");
  const archiveRatio = changes ? archived / changes : 0;

  let subhead: string;
  if (allAdded && archiveRatio < 0.5) {
    subhead =
      `Every requirement so far has only ever been added — none modified, none removed — ` +
      `and with ${words(archived)} of ${words(changes)} changes archived, most of this ` +
      `architecture is still in flight. It grows by accretion.`;
  } else if (allAdded) {
    subhead =
      `Every requirement so far has only ever been added — none modified, none removed. ` +
      `${archived} of ${changes} changes have archived; the declared architecture is steadily landing.`;
  } else if (archiveRatio >= 0.5) {
    subhead =
      `${archived} of ${changes} changes have archived. Requirements have been revised and ` +
      `retired, not only added — this architecture is being reshaped as it lands.`;
  } else {
    subhead =
      `${changes} changes have declared ${requirements} requirements across ${m.capabilityCount} ` +
      `capabilities, ${archived} of them archived. The rest are still in flight.`;
  }

  const headline = allAdded
    ? `${cap1(words(changes))} changes, ${words(requirements)} requirements, zero retractions.`
    : `${cap1(words(changes))} changes across ${words(m.capabilityCount)} capabilities.`;

  return { headline, subhead };
}

function cap1(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- repo readers (impure) ----------

const read = (p: string): string => (existsSync(p) ? readFileSync(p, "utf8") : "");

function gitLogDates(repo: string, follow: boolean, pathspec: string): string[] {
  const args = ["log"];
  if (follow) args.push("--follow");
  args.push("--diff-filter=A", "--format=%ad", "--date=short", "--", pathspec);
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
}

// The change's original add-date, preserved across an archive rename. Two things the naive
// query got wrong: (1) the path must be relative to `repo`, or with a relative `repo` git
// searches `<repo>/<repo>/...` and finds nothing; (2) a directory query cannot follow a
// rename, so an archived change reported its archive-move date. Follow proposal.md (a file
// every change has, so --follow works) back to its original commit; fall back to the
// directory query when there is no proposal.md.
function gitFirstDate(repo: string, path: string): string | null {
  try {
    const relDir = relative(repo, path) || ".";
    if (existsSync(join(path, "proposal.md"))) {
      const dates = gitLogDates(repo, true, join(relDir, "proposal.md"));
      if (dates.length) return dates[dates.length - 1];
    }
    const dirDates = gitLogDates(repo, false, relDir);
    return dirDates.length ? dirDates[dirDates.length - 1] : null;
  } catch { return null; }
}

function collectChange(repo: string, dir: string, archived: boolean): Change {
  const id = basename(dir);
  const proposal = read(join(dir, "proposal.md"));
  const title = (proposal.match(/^#\s+(.+)$/m) ?? [, id])[1] as string;
  const specsDir = join(dir, "specs");
  const capNames = existsSync(specsDir)
    ? readdirSync(specsDir).filter((c) => statSync(join(specsDir, c)).isDirectory())
    : [];
  const capabilities: Capability[] = capNames.map((c) => ({
    name: c, requirements: parseDelta(read(join(specsDir, c, "spec.md"))),
  }));
  const tracked = gitFirstDate(repo, dir);
  const date = tracked ?? statSync(dir).mtime.toISOString().slice(0, 10);
  const reqCount = capabilities.reduce((n, c) => n + c.requirements.length, 0);
  const scenarioCount = capabilities.reduce(
    (n, c) => n + c.requirements.reduce((m, r) => m + r.scenarios.length, 0), 0);
  return {
    id, title,
    why: section(proposal, "Why"),
    what: section(proposal, "What Changes"),
    archived, committed: tracked !== null, date,
    capabilities, tasks: parseTasks(read(join(dir, "tasks.md"))),
    hasDesign: existsSync(join(dir, "design.md")),
    hasProbes: existsSync(join(dir, "probes")),
    reqCount, scenarioCount,
  };
}

export function buildModel(repo: string, generated: string): Model {
  const changesRoot = join(repo, "openspec", "changes");
  if (!existsSync(changesRoot)) {
    throw new Error(`no openspec/changes under ${repo} — not an OpenSpec repo?`);
  }
  const active = readdirSync(changesRoot)
    .filter((d) => d !== "archive" && statSync(join(changesRoot, d)).isDirectory())
    .map((d) => collectChange(repo, join(changesRoot, d), false));

  const archRoot = join(changesRoot, "archive");
  const archived = existsSync(archRoot)
    ? readdirSync(archRoot)
        .filter((d) => statSync(join(archRoot, d)).isDirectory())
        .map((d) => collectChange(repo, join(archRoot, d), true))
    : [];

  const changes = [...archived, ...active].sort((a, b) => a.date.localeCompare(b.date));
  const caps = new Set(changes.flatMap((c) => c.capabilities.map((x) => x.name)));
  const totals = {
    changes: changes.length,
    requirements: changes.reduce((n, c) => n + c.reqCount, 0),
    scenarios: changes.reduce((n, c) => n + c.scenarioCount, 0),
    tasksDone: changes.reduce((n, c) => n + c.tasks.done, 0),
    tasksTotal: changes.reduce((n, c) => n + c.tasks.total, 0),
    archived: changes.filter((c) => c.archived).length,
  };
  const thesis = computeThesis({ changes, totals, capabilityCount: caps.size });
  return { repo: basename(repo === "." ? process.cwd() : repo), generated, thesis, changes, capabilityCount: caps.size, totals };
}

// ---------- render ----------

/** Serialise the model into the template at its single injection point, fail-loud. */
export function render(template: string, model: Model): string {
  const json = JSON.stringify(model);
  // A </script> inside the JSON would terminate the data block. Escape defensively and
  // verify the escape held, rather than trusting it silently.
  const safe = json.replace(/<\/(script)/gi, "<\\/$1");
  if (/<\/script/i.test(safe)) {
    throw new Error("model JSON still contains a script terminator after escaping");
  }
  if (!template.includes("__MODEL__")) {
    throw new Error("template is missing the __MODEL__ injection point");
  }
  return inlineTheme(template).replace("__MODEL__", () => safe);
}

function loadThesis(path: string): Thesis | null {
  try {
    const t = JSON.parse(readFileSync(path, "utf8"));
    if (typeof t.headline === "string" && typeof t.subhead === "string" &&
        t.headline.trim() && t.subhead.trim()) {
      return { headline: t.headline, subhead: t.subhead };
    }
  } catch { /* fall through */ }
  return null;
}

// ---------- main ----------

function main(argv: string[]): void {
  const args = argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = args.filter((a, i) =>
    !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
  const repo = positional[0] ?? ".";
  const jsonOnly = args.includes("--json");
  const outArg = flag("--out");
  const thesisArg = flag("--thesis");

  const generated = new Date().toISOString().slice(0, 10);
  const model = buildModel(repo, generated);

  if (thesisArg) {
    const t = loadThesis(thesisArg);
    if (t) model.thesis = t;
    else console.error(`evolution-timeline: --thesis ${thesisArg} unusable, keeping computed thesis`);
  }

  if (jsonOnly) { console.log(JSON.stringify(model, null, 2)); return; }

  const here = dirname(fileURLToPath(import.meta.url));
  const template = readFileSync(join(here, "evolution-timeline.template.html"), "utf8");
  const html = render(template, model);
  const out = outArg ?? join(repo, "architecture-evolution.html");
  writeFileSync(out, html);
  const t = model.totals;
  console.log(
    `evolution-timeline: ${out}\n` +
    `  ${t.changes} changes · ${model.capabilityCount} capabilities · ` +
    `${t.requirements} requirements · ${t.scenarios} scenarios · ` +
    `${t.tasksDone}/${t.tasksTotal} tasks · ${t.archived} archived`);
}

if (import.meta.main) main(process.argv);
