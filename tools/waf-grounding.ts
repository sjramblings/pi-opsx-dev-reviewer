#!/usr/bin/env bun
// Ground architecture Well-Architected claims in the synced corpus.
//
// Faithful TypeScript port of tools/waf-grounding.py. Exit codes and message strings
// are contract: probes and arch-lint parse them. Do not "improve" the wording.
//   0 ok | 1 unresolvable identifier | 2 CorpusError | 3 CorpusSourceMissing
//   4 LookupSourceMissing / LookupConfigurationMismatch

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import {
  comparePaths,
  exists,
  fullmatch,
  globMd,
  isDir,
  isFile,
  isRelativeTo,
  osErrorText,
  pyJsonDumps,
  pyPath,
  resolvePath,
  splitlines,
  stripChars,
} from "./pylib.ts";

const PROG = "waf-grounding.ts";
const BP_PATTERN = "(?:OPS|SEC|REL|PERF|COST|SUS)\\d{2}-BP\\d{2}";
const RISK_LEVELS = new Set(["HIGH", "MEDIUM", "LOW"]);

class CorpusError extends Error {}
class CorpusSourceMissing extends CorpusError {}
class LookupSourceMissing extends Error {}
class LookupConfigurationMismatch extends Error {}
class LookupResolutionError extends Error {}

interface BestPractice {
  id: string;
  risk_level: string;
  source_url: string;
  title: string;
  pillar: string;
  content_hash: string;
  path: string;
}

interface Corpus {
  root: string;
  tag: string;
  content_hash: string;
  generated_at: string;
  best_practices: Map<string, BestPractice>;
}

function isBpId(value: string): boolean {
  return fullmatch(BP_PATTERN, "", value);
}

function readJson(p: string): Record<string, unknown> {
  let text: string;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "ENOENT") throw new CorpusError(`missing required corpus file: ${p}`);
    throw new CorpusError(`cannot read ${p}: ${osErrorText(e, p)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new CorpusError(`invalid JSON in ${p}: ${(e as Error).message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new CorpusError(`${p} must contain a JSON object`);
  }
  return data as Record<string, unknown>;
}

function cleanScalar(value: string): string {
  const cleaned = value.trim();
  if (cleaned === ">-" || cleaned === "|" || cleaned === "|-") return "";
  if (
    cleaned.length >= 2 &&
    cleaned[0] === cleaned[cleaned.length - 1] &&
    (cleaned[0] === '"' || cleaned[0] === "'")
  ) {
    return cleaned.slice(1, -1);
  }
  return cleaned;
}

function parseFrontmatter(p: string): Record<string, string> {
  let text: string;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (e) {
    throw new CorpusError(`cannot read best-practice file ${p}: ${osErrorText(e, p)}`);
  }
  if (!text.startsWith("---\n")) throw new CorpusError(`${p} is missing frontmatter`);
  const end = text.indexOf("\n---", 4);
  if (end === -1) throw new CorpusError(`${p} has unterminated frontmatter`);
  const fields: Record<string, string> = {};
  let pendingKey = "";
  let pendingValue = "";
  for (const rawLine of splitlines(text.slice(4, end))) {
    if (rawLine.trim() === "") continue;
    if (rawLine.startsWith("  ") && pendingKey) {
      if (pendingValue === ">-" || pendingValue === "|" || pendingValue === "|-") {
        pendingValue = rawLine.trim();
      } else {
        pendingValue = `${pendingValue}${rawLine.trim()}`;
      }
      fields[pendingKey] = cleanScalar(pendingValue);
      continue;
    }
    if (!rawLine.includes(":")) continue;
    const idx = rawLine.indexOf(":");
    pendingKey = rawLine.slice(0, idx).trim();
    pendingValue = rawLine.slice(idx + 1).trim();
    fields[pendingKey] = cleanScalar(pendingValue);
  }
  return fields;
}

function frontmatterBestPractice(p: string): BestPractice {
  const fields = parseFrontmatter(p);
  const bpId = (fields["id"] ?? "").toUpperCase();
  if (!isBpId(bpId)) {
    throw new CorpusError(`${p} has invalid or missing best-practice id in frontmatter`);
  }
  const risk = (fields["risk_level"] ?? "").toUpperCase();
  if (!RISK_LEVELS.has(risk)) {
    throw new CorpusError(`${p} has invalid or missing frontmatter risk_level for ${bpId}`);
  }
  const sourceUrl = fields["source_url"] ?? "";
  if (!sourceUrl.startsWith("https://")) {
    throw new CorpusError(`${p} has invalid or missing source_url for ${bpId}`);
  }
  const title = fields["title"] ?? "";
  if (!title) throw new CorpusError(`${p} has missing title for ${bpId}`);
  const pillar = fields["pillar"] ?? "";
  if (!pillar) throw new CorpusError(`${p} has missing pillar for ${bpId}`);
  const contentHash = fields["content_hash"] ?? "";
  if (!contentHash.startsWith("sha256:")) {
    throw new CorpusError(`${p} has invalid or missing content_hash for ${bpId}`);
  }
  return {
    id: bpId,
    risk_level: risk,
    source_url: sourceUrl,
    title,
    pillar,
    content_hash: contentHash,
    path: p,
  };
}

function corpusTag(root: string, meta: Record<string, unknown>): string {
  for (const name of ["CORPUS_TAG", "VERSION", "TAG"]) {
    const candidate = path.join(root, name);
    if (isFile(candidate)) {
      const value = fs.readFileSync(candidate, "utf8").trim();
      if (value) return value;
    }
  }
  // Python `or` chain: empty strings are falsy and fall through.
  const metaTag = (meta["tag"] || meta["version"] || meta["generated_at"]) as unknown;
  if (typeof metaTag === "string" && metaTag.trim()) {
    if (metaTag === meta["generated_at"]) return `generated-at:${metaTag}`;
    return metaTag.trim();
  }
  throw new CorpusError("corpus metadata has no tag, version, or generated_at field");
}

function loadCorpus(root: string): Corpus {
  const dataDir = path.join(root, "data");
  const bpDir = path.join(dataDir, "best-practices");
  if (!isDir(root)) throw new CorpusError(`corpus root not found: ${root}`);
  if (!isDir(bpDir)) throw new CorpusError(`missing best-practices directory: ${bpDir}`);
  const meta = readJson(path.join(dataDir, "_meta.json"));
  const bundle = readJson(path.join(dataDir, "aws-well-architected.json"));
  const expectedCount = meta["bp_count"];
  if (typeof expectedCount !== "number" || !Number.isInteger(expectedCount) || expectedCount <= 0) {
    throw new CorpusError("corpus metadata is missing positive bp_count");
  }
  const metaHash = meta["content_hash"];
  if (typeof metaHash !== "string" || !metaHash.startsWith("sha256:")) {
    throw new CorpusError("corpus metadata is missing content_hash");
  }
  const metaHashes = meta["best_practices"];
  if (metaHashes === null || typeof metaHashes !== "object" || Array.isArray(metaHashes)) {
    throw new CorpusError("corpus metadata is missing best_practices hash map");
  }
  const bundleBps = bundle["best_practices"];
  if (!Array.isArray(bundleBps)) {
    throw new CorpusError("aws-well-architected.json is missing best_practices list");
  }
  const files = globMd(bpDir);
  if (files.length !== expectedCount) {
    throw new CorpusError(
      `best-practices file count ${files.length} does not match metadata bp_count ${expectedCount}`,
    );
  }
  if (bundleBps.length !== expectedCount) {
    throw new CorpusError(
      `bundle best_practices count ${bundleBps.length} does not match metadata bp_count ${expectedCount}`,
    );
  }
  const practices = new Map<string, BestPractice>();
  const hashMap = metaHashes as Record<string, unknown>;
  for (const p of files) {
    const bp = frontmatterBestPractice(p);
    const expectedHash = hashMap[bp.id];
    if (expectedHash !== bp.content_hash) {
      throw new CorpusError(`metadata hash for ${bp.id} does not match best-practice frontmatter`);
    }
    if (practices.has(bp.id)) throw new CorpusError(`duplicate best-practice id: ${bp.id}`);
    practices.set(bp.id, bp);
  }
  const bundleIds = new Set<string>();
  for (const item of bundleBps) {
    if (item === null || typeof item !== "object" || Array.isArray(item) || typeof (item as Record<string, unknown>)["id"] !== "string") {
      throw new CorpusError("bundle best_practices contains an item without an id");
    }
    bundleIds.add(((item as Record<string, unknown>)["id"] as string).toUpperCase());
  }
  const sameIds =
    practices.size === bundleIds.size && [...practices.keys()].every((id) => bundleIds.has(id));
  if (!sameIds) {
    throw new CorpusError("best-practice markdown ids do not match aws-well-architected.json ids");
  }
  return {
    root,
    tag: corpusTag(root, meta),
    content_hash: metaHash,
    generated_at: String(meta["generated_at"] ?? ""),
    best_practices: practices,
  };
}

function lookupCandidates(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".pi", "agent", "skills", "pi-skill-wellarchitected", "scripts", "wa_lookup.py"),
    path.join(home, ".pi", "agent", "skills", "wellarchitected", "scripts", "wa_lookup.py"),
    path.join(home, ".pi", "agent", "skills", "aws-well-architected-review", "scripts", "wa_lookup.py"),
  ];
}

function findLookup(explicit: string | undefined): string | null {
  if (explicit) {
    const candidate = pyPath(expandUserPath(explicit));
    if (isFile(candidate)) return candidate;
    throw new LookupSourceMissing(`configured lookup helper is not a file: ${candidate}`);
  }
  for (const candidate of lookupCandidates()) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function expandUserPath(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function expectedLookupCorpusRoot(lookup: string): string {
  let resolved: string;
  try {
    resolved = resolvePath(lookup);
  } catch (e) {
    throw new LookupSourceMissing(`cannot resolve lookup helper path ${lookup}: ${osErrorText(e, lookup)}`);
  }
  if (path.basename(path.dirname(resolved)) !== "scripts") {
    throw new LookupSourceMissing(`lookup helper is not inside a skill scripts directory: ${lookup}`);
  }
  return path.join(path.dirname(path.dirname(resolved)), "references", "aws-well-architected-corpus");
}

function ensureLookupMatchesCorpus(lookup: string | null, corpusRoot: string): void {
  if (lookup === null) return;
  const lookupCorpus = expectedLookupCorpusRoot(lookup);
  if (!isDir(lookupCorpus)) {
    throw new CorpusSourceMissing(`lookup helper corpus is not synced: ${lookupCorpus}`);
  }
  let selected: string;
  let helperCorpus: string;
  try {
    selected = resolvePath(corpusRoot);
    helperCorpus = resolvePath(lookupCorpus);
  } catch (e) {
    throw new LookupConfigurationMismatch(
      `cannot compare lookup helper corpus with selected corpus: ${osErrorText(e, corpusRoot)}`,
    );
  }
  if (selected !== helperCorpus) {
    throw new LookupConfigurationMismatch(
      `selected corpus ${selected} does not match lookup helper corpus ${helperCorpus}`,
    );
  }
}

function corpusCandidates(lookup: string | null): string[] {
  const home = os.homedir();
  const skillRoot = path.join(home, ".pi", "agent", "skills");
  const candidates = [
    path.join(skillRoot, "pi-skill-wellarchitected", "references", "aws-well-architected-corpus"),
    path.join(skillRoot, "wellarchitected", "references", "aws-well-architected-corpus"),
    path.join(skillRoot, "aws-well-architected-review", "references", "aws-well-architected-corpus"),
  ];
  if (lookup !== null) {
    let adjacent: string | null = null;
    try {
      const resolvedLookup = resolvePath(lookup);
      const parents1 = path.dirname(path.dirname(resolvedLookup));
      const candidate = path.join(parents1, "references", "aws-well-architected-corpus");
      // Path.relative_to() raises ValueError when not contained -> adjacent stays null.
      if (isRelativeTo(candidate, resolvePath(skillRoot))) adjacent = candidate;
    } catch (e) {
      throw new CorpusError(`cannot resolve lookup helper path ${lookup}: ${osErrorText(e, lookup)}`);
    }
    if (adjacent !== null) {
      const at = candidates.indexOf(adjacent);
      if (at !== -1) candidates.splice(at, 1);
      candidates.unshift(adjacent);
    }
  }
  return candidates;
}

function findCorpus(explicit: string | undefined, lookup: string | null): string {
  if (explicit) {
    const candidate = pyPath(expandUserPath(explicit));
    if (isDir(candidate)) return candidate;
    throw new CorpusSourceMissing(`configured corpus root not found: ${candidate}`);
  }
  const searched = corpusCandidates(lookup);
  for (const candidate of searched) {
    if (isDir(candidate)) return candidate;
  }
  throw new CorpusSourceMissing(
    `no aws-well-architected-corpus source found; searched: ${searched.join(", ")}`,
  );
}

function explicitCorpusAdjacentLookup(corpusRoot: string): string | null {
  let selected: string;
  try {
    selected = resolvePath(corpusRoot);
  } catch (e) {
    throw new CorpusError(`cannot resolve configured corpus root ${corpusRoot}: ${osErrorText(e, corpusRoot)}`);
  }
  if (
    path.basename(selected) !== "aws-well-architected-corpus" ||
    path.basename(path.dirname(selected)) !== "references"
  ) {
    return null;
  }
  const candidate = path.join(path.dirname(path.dirname(selected)), "scripts", "wa_lookup.py");
  if (isFile(candidate)) return candidate;
  throw new LookupSourceMissing(`configured skill corpus has no adjacent lookup helper: ${candidate}`);
}

interface Args {
  corpus_dir?: string;
  lookup?: string;
  command: string;
  ids: string[];
  format: string;
  risk: string;
  full_sweep: boolean;
  output?: string;
}

function loadGrounding(args: Args): [Corpus, string | null] {
  const explicitLookup =
    args.lookup || process.env.ARCH_WAF_LOOKUP || process.env.ARCH_LINT_WA_LOOKUP || undefined;
  const explicitCorpus =
    args.corpus_dir || process.env.ARCH_WAF_CORPUS_DIR || process.env.ARCH_LINT_CORPUS_DIR || undefined;
  let lookup = explicitLookup || !explicitCorpus ? findLookup(explicitLookup) : null;
  const corpusRoot = findCorpus(explicitCorpus, lookup);
  if (lookup === null && explicitCorpus) lookup = explicitCorpusAdjacentLookup(corpusRoot);
  ensureLookupMatchesCorpus(lookup, corpusRoot);
  return [loadCorpus(corpusRoot), lookup];
}

function bpToJson(bp: BestPractice): Record<string, string> {
  return {
    id: bp.id,
    risk_level: bp.risk_level,
    source_url: bp.source_url,
    title: bp.title,
    pillar: bp.pillar,
    content_hash: bp.content_hash,
    path: bp.path,
  };
}

function corpusToJson(corpus: Corpus): Record<string, string | number> {
  return {
    root: corpus.root,
    tag: corpus.tag,
    content_hash: corpus.content_hash,
    generated_at: corpus.generated_at,
    bp_count: corpus.best_practices.size,
  };
}

// The lookup helper is a third-party pi skill and stays Python; invoke it as a subprocess.
// The Python original used sys.executable; python3 is the equivalent entry point here.
function resolveWithLookup(lookup: string, bpId: string): void {
  const result = spawnSync("python3", [lookup, "bp", bpId], {
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === "ETIMEDOUT" || result.signal === "SIGTERM") {
      throw new LookupResolutionError(`${bpId} lookup timed out after 15 seconds`);
    }
    throw new LookupResolutionError(`${bpId} lookup execution failed: ${err.message}`);
  }
  if (result.status !== 0) {
    const detail =
      (result.stderr ?? "").trim() || (result.stdout ?? "").trim() || "no lookup detail";
    throw new LookupResolutionError(`${bpId} lookup helper exited ${result.status}: ${detail}`);
  }
  if (!(result.stdout ?? "").toUpperCase().includes(bpId)) {
    throw new LookupResolutionError(`${bpId} lookup helper returned success without naming the identifier`);
  }
}

function commandResolve(args: Args): number {
  const [corpus, lookup] = loadGrounding(args);
  const resolved: BestPractice[] = [];
  const missing: string[] = [];
  for (const rawId of args.ids) {
    const bpId = rawId.toUpperCase();
    if (!isBpId(bpId)) {
      missing.push(`${rawId} (invalid best-practice identifier format)`);
      continue;
    }
    if (lookup !== null) {
      try {
        resolveWithLookup(lookup, bpId);
      } catch (e) {
        if (e instanceof LookupResolutionError) {
          missing.push(e.message);
          continue;
        }
        throw e;
      }
    }
    if (!corpus.best_practices.has(bpId)) {
      missing.push(`${bpId} (not present in selected corpus after lookup resolution)`);
      continue;
    }
    resolved.push(corpus.best_practices.get(bpId)!);
  }
  if (missing.length > 0) {
    for (const item of missing) {
      process.stderr.write(`waf-grounding: unresolvable identifier — ${item}\n`);
    }
    return 1;
  }
  if (args.format === "json") {
    process.stdout.write(
      pyJsonDumps({
        corpus: corpusToJson(corpus),
        best_practices: resolved.map(bpToJson),
      }) + "\n",
    );
  } else {
    for (const bp of resolved) {
      process.stdout.write(`${bp.id} | risk=${bp.risk_level} | source=${bp.source_url}\n`);
    }
  }
  return 0;
}

function scopedBestPractices(corpus: Corpus, fullSweep: boolean, risk: string): BestPractice[] {
  const values = [...corpus.best_practices.values()];
  const selected = fullSweep ? values : values.filter((bp) => bp.risk_level === risk);
  return selected.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function markdownScope(corpus: Corpus, selected: BestPractice[], fullSweep: boolean, risk: string): string {
  const scopeName = fullSweep ? "FULL-SWEEP" : `${risk}-risk default`;
  const lines = [
    `Well-Architected scope: ${scopeName}`,
    `Full sweep: ${fullSweep ? "true" : "false"}`,
    `Corpus tag: ${corpus.tag}`,
    `Corpus content hash: ${corpus.content_hash}`,
    `Assessed best practices: ${selected.length}`,
    "",
    "| ID | Risk | Source URL | Title |",
    "| --- | --- | --- | --- |",
  ];
  for (const bp of selected) {
    lines.push(`| ${bp.id} | ${bp.risk_level} | ${bp.source_url} | ${bp.title} |`);
  }
  return lines.join("\n") + "\n";
}

function textScope(corpus: Corpus, selected: BestPractice[], fullSweep: boolean, risk: string): string {
  const scopeName = fullSweep ? "FULL-SWEEP" : `${risk}-risk default`;
  const lines = [
    `scope=${scopeName}`,
    `full_sweep=${fullSweep ? "true" : "false"}`,
    `corpus_tag=${corpus.tag}`,
    `corpus_content_hash=${corpus.content_hash}`,
    `assessed_best_practices=${selected.length}`,
  ];
  for (const bp of selected) {
    lines.push(`${bp.id} risk=${bp.risk_level} source=${bp.source_url}`);
  }
  return lines.join("\n") + "\n";
}

function commandScope(args: Args): number {
  const [corpus] = loadGrounding(args);
  const risk = args.risk.toUpperCase();
  if (!RISK_LEVELS.has(risk)) {
    process.stderr.write(`waf-grounding: invalid risk scope: ${args.risk}\n`);
    return 1;
  }
  const selected = scopedBestPractices(corpus, args.full_sweep, risk);
  let output: string;
  if (args.format === "json") {
    output =
      pyJsonDumps({
        corpus: corpusToJson(corpus),
        scope: args.full_sweep ? "FULL-SWEEP" : risk,
        full_sweep: args.full_sweep,
        assessed_count: selected.length,
        best_practices: selected.map(bpToJson),
      }) + "\n";
  } else if (args.format === "text") {
    output = textScope(corpus, selected, args.full_sweep, risk);
  } else {
    output = markdownScope(corpus, selected, args.full_sweep, risk);
  }
  if (args.output) {
    const destination = pyPath(args.output);
    try {
      const parent = path.dirname(destination);
      fs.mkdirSync(parent, { recursive: true });
      fs.writeFileSync(destination, output, "utf8");
    } catch (e) {
      process.stderr.write(`waf-grounding: cannot write ${destination}: ${osErrorText(e, destination)}\n`);
      return 1;
    }
  } else {
    process.stdout.write(output);
  }
  return 0;
}

function commandMeta(args: Args): number {
  const [corpus] = loadGrounding(args);
  process.stdout.write(pyJsonDumps(corpusToJson(corpus)) + "\n");
  return 0;
}

const USAGE = `usage: ${PROG} [-h] [--corpus-dir CORPUS_DIR] [--lookup LOOKUP]
                        {meta,resolve,scope} ...`;

// Subparser usage lines, wrapped exactly as argparse wraps them at the default width.
const SUB_USAGE: Record<string, string> = {
  meta: `usage: ${PROG} meta [-h]`,
  resolve: `usage: ${PROG} resolve [-h] [--format {text,json}] ids [ids ...]`,
  scope: `usage: ${PROG} scope [-h] [--risk RISK] [--full-sweep]
                              [--format {markdown,text,json}]
                              [--output OUTPUT]`,
};

const HELP = `${USAGE}

Resolve and scope Well-Architected best practices from the synced corpus

positional arguments:
  {meta,resolve,scope}
    meta                Validate corpus sync and print provenance
    resolve             Resolve best-practice identifiers and print
                        frontmatter grounding
    scope               Print the default HIGH-risk assessment scope or a full
                        sweep

options:
  -h, --help            show this help message and exit
  --corpus-dir CORPUS_DIR
                        Path to aws-well-architected-corpus; defaults to the
                        installed skill corpus
  --lookup LOOKUP       Path to the pi-skill-wellarchitected wa_lookup.py
                        helper
`;

// Per-subparser --help, reproducing argparse's layout and wrapping.
const SUB_HELP: Record<string, string> = {
  meta: `${SUB_USAGE["meta"]}

options:
  -h, --help  show this help message and exit
`,
  resolve: `${SUB_USAGE["resolve"]}

positional arguments:
  ids                   Best-practice identifiers such as SEC01-BP02

options:
  -h, --help            show this help message and exit
  --format {text,json}
`,
  scope: `${SUB_USAGE["scope"]}

options:
  -h, --help            show this help message and exit
  --risk RISK           Risk level for the default scoped pass; default: HIGH
  --full-sweep          Assess every risk level instead of only the risk scope
  --format {markdown,text,json}
  --output OUTPUT       Write the scope record to this path instead of stdout
`,
};

/** Unwinds to the top level so buffered stdout still flushes; process.exit() would
 *  truncate a piped write at the 64KB pipe buffer. */
class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit:${code}`);
  }
}

/** argparse exits 2 on a usage error, printing usage then the message. `scope` is the
 *  prog for subcommand-level errors, matching argparse's per-subparser usage. */
function usageError(message: string, sub?: string): never {
  const usage = sub ? SUB_USAGE[sub] : USAGE;
  const prog = sub ? `${PROG} ${sub}` : PROG;
  process.stderr.write(usage + "\n");
  process.stderr.write(`${prog}: error: ${message}\n`);
  throw new ExitSignal(2);
}

/** Mirrors argparse: global options are accepted only BEFORE the subcommand. */
function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: "",
    ids: [],
    format: "",
    risk: "HIGH",
    full_sweep: false,
  };

  const takeValue = (token: string, name: string, rest: string[], sub?: string): string => {
    if (token.includes("=")) return token.slice(token.indexOf("=") + 1);
    const value = rest.shift();
    if (value === undefined) usageError(`argument ${name}: expected one argument`, sub);
    return value;
  };

  const queue = [...argv];
  // Global options precede the subcommand.
  while (queue.length > 0) {
    const token = queue[0];
    if (token === "-h" || token === "--help") {
      process.stdout.write(HELP);
      throw new ExitSignal(0);
    }
    if (token === "--corpus-dir" || token.startsWith("--corpus-dir=")) {
      queue.shift();
      args.corpus_dir = takeValue(token, "--corpus-dir", queue);
      continue;
    }
    if (token === "--lookup" || token.startsWith("--lookup=")) {
      queue.shift();
      args.lookup = takeValue(token, "--lookup", queue);
      continue;
    }
    if (token.startsWith("-") && token !== "-") {
      usageError(`unrecognized arguments: ${token}`);
    }
    break;
  }

  const command = queue.shift();
  if (command === undefined) {
    usageError("the following arguments are required: command");
  }
  if (command !== "meta" && command !== "resolve" && command !== "scope") {
    usageError(`argument command: invalid choice: '${command}' (choose from 'meta', 'resolve', 'scope')`);
  }
  args.command = command;

  const choices = (name: string, value: string, allowed: string[], sub: string): string => {
    if (!allowed.includes(value)) {
      usageError(
        `argument ${name}: invalid choice: '${value}' (choose from ${allowed
          .map((c) => `'${c}'`)
          .join(", ")})`,
        sub,
      );
    }
    return value;
  };

  const subHelp = (sub: string): never => {
    process.stdout.write(SUB_HELP[sub]);
    throw new ExitSignal(0);
  };

  if (command === "meta") {
    if (queue[0] === "-h" || queue[0] === "--help") subHelp("meta");
    if (queue.length > 0) usageError(`unrecognized arguments: ${queue.join(" ")}`);
    return args;
  }

  if (command === "resolve") {
    args.format = "text";
    while (queue.length > 0) {
      const token = queue.shift()!;
      if (token === "-h" || token === "--help") subHelp("resolve");
      if (token === "--format" || token.startsWith("--format=")) {
        args.format = choices(
          "--format",
          takeValue(token, "--format", queue, "resolve"),
          ["text", "json"],
          "resolve",
        );
        continue;
      }
      if (token.startsWith("--")) usageError(`unrecognized arguments: ${token}`);
      args.ids.push(token);
    }
    if (args.ids.length === 0) {
      usageError("the following arguments are required: ids", "resolve");
    }
    return args;
  }

  // scope
  args.format = "markdown";
  const extras: string[] = [];
  while (queue.length > 0) {
    const token = queue.shift()!;
    if (token === "-h" || token === "--help") subHelp("scope");
    if (token === "--full-sweep") {
      args.full_sweep = true;
      continue;
    }
    if (token === "--risk" || token.startsWith("--risk=")) {
      args.risk = takeValue(token, "--risk", queue, "scope");
      continue;
    }
    if (token === "--format" || token.startsWith("--format=")) {
      args.format = choices(
        "--format",
        takeValue(token, "--format", queue, "scope"),
        ["markdown", "text", "json"],
        "scope",
      );
      continue;
    }
    if (token === "--output" || token.startsWith("--output=")) {
      args.output = takeValue(token, "--output", queue, "scope");
      continue;
    }
    extras.push(token);
  }
  if (extras.length > 0) usageError(`unrecognized arguments: ${extras.join(" ")}`);
  return args;
}

function run(argv: string[]): number {
  const args = parseArgs(argv);
  try {
    if (args.command === "meta") return commandMeta(args);
    if (args.command === "resolve") return commandResolve(args);
    return commandScope(args);
  } catch (e) {
    // Order matters: CorpusSourceMissing is a subclass of CorpusError.
    if (e instanceof LookupSourceMissing) {
      process.stderr.write(`waf-grounding: lookup-misconfigured — ${e.message}\n`);
      return 4;
    }
    if (e instanceof LookupConfigurationMismatch) {
      process.stderr.write(`waf-grounding: configuration-mismatch — ${e.message}\n`);
      return 4;
    }
    if (e instanceof CorpusSourceMissing) {
      process.stderr.write(`waf-grounding: sync-required — source-missing — ${e.message}\n`);
      return 3;
    }
    if (e instanceof CorpusError) {
      process.stderr.write(`waf-grounding: sync-required — ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

function main(argv: string[]): number {
  try {
    return run(argv);
  } catch (e) {
    if (e instanceof ExitSignal) return e.code;
    throw e;
  }
}

// Assign exitCode rather than calling process.exit(): process.exit() abandons buffered
// stdout, truncating piped output at the 64KB pipe buffer (proven on `scope --format
// json`, 69022 bytes -> 65536). Letting the process end naturally flushes in full.
process.exitCode = main(process.argv.slice(2));
