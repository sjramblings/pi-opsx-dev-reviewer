#!/usr/bin/env bun
// Lint the generated architecture tree.
//
// Faithful TypeScript port of the python3 heredoc previously inlined in the
// justfile.opsx `arch-lint` recipe. Reports FAIL for real violations, PARTIAL when an
// optional lookup tool/source is missing, and clean only when every check ran.
//
// Usage: bun tools/arch-lint.ts <tree> <decisions>
//
// Regex literals are fine here: the no-regex-literal rule exists for extensions/*/index.ts
// (the pi tokenizer), not for tools/.

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import * as os from "node:os";
import {
  fullmatch,
  globPrefix,
  isDir,
  isFile,
  exists,
  osErrorText,
  pyPath,
  resolvePath,
  rglobMd,
  splitlines,
  stripChars,
  isRelativeTo,
} from "./pylib.ts";
import { renderTree } from "./architecture-html.ts";

const TREE = pyPath(process.argv[2] ?? "");
const DECISIONS = pyPath(process.argv[3] ?? "");

const EXPECTED_SECTIONS = [
  "01-introduction-and-goals.md",
  "02-constraints.md",
  "03-context-and-scope.md",
  "04-solution-strategy.md",
  "05-building-block-view.md",
  "06-runtime-view.md",
  "07-deployment-view.md",
  "08-crosscutting-concepts.md",
  "09-architecture-decisions.md",
  "10-quality-requirements.md",
  "11-risks-and-technical-debt.md",
  "12-glossary.md",
];

const BP_RE_SRC = "\\b(?:OPS|SEC|REL|PERF|COST|SUS)\\d{2}-BP\\d{2}\\b";
const BP_FULL_SRC = "(?:OPS|SEC|REL|PERF|COST|SUS)\\d{2}-BP\\d{2}";
const CITE_CANDIDATE_SRC =
  "(?<![A-Za-z0-9_./:-])(?<path>(?![A-Za-z][A-Za-z0-9+.-]*://)[^\\s:|<>()\\[\\]{}\"'`]+):(?<line>[1-9]\\d*)\\b";

const REPO_ROOT = resolvePath(process.cwd());

const failures: string[] = [];
let skipped = 0;

const print = (s: string): void => {
  process.stdout.write(s + "\n");
};

// Python `[^\W_]` is Unicode-aware (any letter/number). JS `\w` is ASCII-only, so the
// naive translation would call non-ASCII prose "empty". Unicode property escapes restore
// CPython's behaviour.
const ALNUM_RE = new RegExp("[\\p{L}\\p{N}]", "u");

type Row = [number, string];

function readText(p: string): string {
  try {
    const buf = fs.readFileSync(p);
    const text = buf.toString("utf8");
    // Node substitutes U+FFFD instead of raising; detect it the way Python raises
    // UnicodeDecodeError so a non-UTF-8 file still fails the check.
    if (text.includes("�") && !buf.includes(Buffer.from("�", "utf8"))) {
      failures.push(`${p}: not valid UTF-8 (invalid start byte)`);
      return "";
    }
    return text;
  } catch (e) {
    failures.push(`${p}: cannot read (${osErrorText(e, p)})`);
    return "";
  }
}

function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function contentLines(p: string): Row[] {
  const text = readText(p);
  const stripped = stripHtmlComments(text);
  return splitlines(stripped).map((line, i) => [i + 1, line.replace(/\s+$/, "")] as Row);
}

function isTableRow(value: string): boolean {
  const candidate = value.trim();
  return candidate.startsWith("|") || candidate.endsWith("|");
}

function tableCells(value: string): string[] {
  return stripChars(value.trim(), "|")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparatorRow(value: string): boolean {
  const cells = tableCells(value);
  return cells.length > 0 && cells.every((cell) => !cell || fullmatch(":?-{3,}:?", "", cell));
}

function hasTextualPayload(value: string): boolean {
  let candidate = value.trim();
  if (!candidate) return false;
  if (fullmatch("(?:[-*_]\\s*){3,}", "", candidate)) return false;
  candidate = candidate.replace(/^(?:>\s*)+/, "").trim();
  candidate = candidate.replace(/^(?:[-*+]|\d+[.)])\s*/, "").trim();
  candidate = candidate.replace(/^\[[ xX]\]\s*/, "").trim();
  if (!candidate) return false;
  if (/^#{1,6}(?:\s+|$)/.test(candidate)) return false;
  if (isTableRow(candidate)) {
    if (isTableSeparatorRow(candidate)) return false;
    const cells = tableCells(candidate);
    const hasPayloadCell = cells.some((cell) => cell && !fullmatch(":?-{3,}:?", "", cell));
    if (!hasPayloadCell) return false;
  }
  return ALNUM_RE.test(candidate);
}

function nonemptyTablePayloadRows(block: Row[]): Row[] {
  if (block.length === 0) return [];
  let candidates: Row[];
  if (block.length >= 2 && isTableSeparatorRow(block[1][1])) candidates = block.slice(2);
  else if (isTableSeparatorRow(block[0][1])) candidates = block.slice(1);
  else if (block.length === 1) candidates = [];
  else candidates = block.slice(1);
  return candidates.filter(([, value]) => hasTextualPayload(value));
}

function citationPathResolves(rawPath: string): boolean {
  const pathText = rawPath.trim();
  if (!pathText) return false;
  if (
    pathText.includes("://") ||
    pathText.startsWith("/") ||
    pathText.startsWith("\\") ||
    pathText.startsWith("~") ||
    pathText.includes("\\")
  ) {
    return false;
  }
  const candidate = resolvePath(path.join(REPO_ROOT, pathText));
  if (!isRelativeTo(candidate, REPO_ROOT)) return false;
  return isFile(candidate);
}

function hasRepoFileLineCitation(text: string): boolean {
  const re = new RegExp(CITE_CANDIDATE_SRC, "g");
  for (const match of text.matchAll(re)) {
    if (citationPathResolves(match.groups?.["path"] ?? "")) return true;
  }
  return false;
}

const PLACEHOLDER_COMPACTS = new Set([
  "n",
  "na",
  "t",
  "notapplicable",
  "tbd",
  "tba",
  "todo",
  "tobedetermined",
  "tobedecided",
  "tobeassessed",
  "unknown",
  "notknown",
  "pending",
  "notrecorded",
  "unrecorded",
  "notstated",
  "notidentified",
  "notavailable",
  "notassessed",
  "none",
  "missing",
  "absent",
]);

const PLACEHOLDER_PREFIX_RE =
  /^(?:n\s*\/?\s*a|not applicable|tbd|tba|to be (?:determined|decided|assessed)|todo|unknown|not known|pending|not recorded|unrecorded|not stated|not identified|not available|not assessed|none|missing|absent)\b/i;

function hasNonPlaceholderPayload(payload: string): boolean {
  let cleaned = payload.replace(/^[\s:—\-|,()\[\]]+/, "").trim();
  cleaned = cleaned.replace(/[\s:—\-|,()\[\]]+$/, "").trim();
  cleaned = cleaned.replace(/\s+/g, " ");
  if (!cleaned) return false;
  let normalized = cleaned.replace(/[*_`"'“”‘’]/g, "").toLowerCase().trim();
  normalized = normalized.replace(/\s+/g, " ");
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  if (PLACEHOLDER_COMPACTS.has(compact)) return false;
  if (PLACEHOLDER_PREFIX_RE.test(normalized)) return false;
  return ALNUM_RE.test(normalized);
}

function nonemptyContentAfterH1(p: string): Row[] {
  const rows = contentLines(p);
  const body: Row[] = [];
  let seenH1 = false;
  let index = 0;
  while (index < rows.length) {
    const [lineNo, line] = rows[index];
    if (line.startsWith("# ") && !seenH1) {
      seenH1 = true;
      index += 1;
      continue;
    }
    if (!seenH1) {
      index += 1;
      continue;
    }
    const value = line.trim();
    if (isTableRow(value)) {
      const block: Row[] = [];
      while (index < rows.length && isTableRow(rows[index][1].trim())) {
        const [blockLineNo, blockLine] = rows[index];
        block.push([blockLineNo, blockLine.trim()]);
        index += 1;
      }
      body.push(...nonemptyTablePayloadRows(block));
      continue;
    }
    if (hasTextualPayload(value)) body.push([lineNo, value]);
    index += 1;
  }
  return body;
}

function lineIndent(line: string): number {
  return line.length - line.replace(/^ +/, "").length;
}

function isListItemLine(line: string): boolean {
  return /^(?:[-*+]\s+|\d+\.\s+)/.test(line.trim());
}

function bestPracticeClaimStart(rows: Row[], startIndex: number): [number, string, number] {
  const line = rows[startIndex][1];
  const value = line.trim();
  if (value.startsWith("|")) return [startIndex, "table", lineIndent(line)];
  const currentIndent = lineIndent(line);
  for (let index = startIndex; index >= 0; index--) {
    const candidate = rows[index][1];
    const candidateValue = candidate.trim();
    if (!candidateValue) break;
    if (candidateValue.startsWith("#") || candidateValue.startsWith("|")) break;
    if (isListItemLine(candidate)) {
      const candidateIndent = lineIndent(candidate);
      if (index === startIndex || candidateIndent <= currentIndent) {
        return [index, "list", candidateIndent];
      }
    }
  }
  return [startIndex, "paragraph", currentIndent];
}

function bestPracticeClaimBlock(rows: Row[], startIndex: number): string {
  const [blockStart, blockKind, blockIndent] = bestPracticeClaimStart(rows, startIndex);
  const pieces: string[] = [];
  const slice = rows.slice(blockStart);
  for (let offset = 0; offset < slice.length; offset++) {
    const line = slice[offset][1];
    const value = line.trim();
    if (!value) {
      if (pieces.length > 0 && blockKind !== "list") break;
      continue;
    }
    if (value.startsWith("#")) {
      if (offset === 0) continue;
      break;
    }
    if (offset > 0) {
      const indent = lineIndent(line);
      if (blockKind === "table") break;
      if (blockKind === "list") {
        if (value.startsWith("|")) break;
        if (isListItemLine(line) && indent <= blockIndent) break;
      } else {
        if (value.startsWith("|") || isListItemLine(line)) break;
      }
    }
    pieces.push(value);
  }
  return pieces.join("\n");
}

function currentClaimBlock(
  rows: Row[],
  startIndex: number,
  isNextClaim: (line: string) => boolean,
): string {
  const startLine = rows[startIndex][1];
  const startValue = startLine.trim();
  const startIndent = lineIndent(startLine);
  let blockKind: string;
  if (startValue.startsWith("|")) blockKind = "table";
  else if (isListItemLine(startLine)) blockKind = "list";
  else if (startValue.startsWith("#")) blockKind = "heading";
  else blockKind = "paragraph";
  const pieces: string[] = [];
  const slice = rows.slice(startIndex);
  for (let offset = 0; offset < slice.length; offset++) {
    const line = slice[offset][1];
    const value = line.trim();
    if (!value) {
      if (pieces.length > 0) break;
      continue;
    }
    if (offset > 0) {
      const indent = lineIndent(line);
      if (value.startsWith("#")) break;
      if (isNextClaim(line)) break;
      if (blockKind === "table") break;
      if (blockKind === "list") {
        if (value.startsWith("|")) break;
        if (isListItemLine(line) && indent <= startIndent) break;
      } else if (blockKind === "paragraph") {
        if (value.startsWith("|") || isListItemLine(line)) break;
      }
    } else if (value.startsWith("#")) {
      continue;
    }
    pieces.push(value);
  }
  return pieces.join("\n");
}

function printCheck(name: string): void {
  print(`── ${name} ──`);
}

function passCheck(name: string): void {
  print(`${name}: ok`);
}

function failCheck(name: string, items: string[]): void {
  for (const item of items) print(`${name}: FAIL — ${item}`);
}

const allMd = rglobMd(TREE);

const CONSEQUENCE_RE =
  /\b(consequence|consequences|trade[- ]offs?|costs?|gives up|accepted downsides?)\b/gi;
const NEGATED_CONSEQUENCE_RE =
  /\b(?:no|not|without|missing|lacks?|absent|none|unknown|pending|unrecorded)\b(?:\W+\w+){0,5}\W+(?:consequence|consequences|trade[- ]offs?|costs?|gives up|accepted downsides?)\b|\b(?:consequence|consequences|trade[- ]offs?|costs?|gives up|accepted downsides?)\b(?:\W+\w+){0,5}\W+(?:not\W+(?:recorded|identified|stated|available|known)|missing|absent|unknown|pending|none|unrecorded)\b/i;

function search(re: RegExp, s: string): boolean {
  return new RegExp(re.source, re.flags.replace("g", "")).test(s);
}

function hasExplanatoryConsequencePayload(payload: string): boolean {
  return hasNonPlaceholderPayload(payload);
}

function isBareConsequenceLabel(unit: string): boolean {
  let candidate = unit.trim();
  candidate = candidate.replace(/^(?:>\s*)+/, "").trim();
  candidate = candidate.replace(/^(?:[-*+]|\d+[.)])\s*/, "").trim();
  candidate = candidate.replace(/^\[[ xX]\]\s*/, "").trim();
  candidate = stripChars(candidate, "*_` ");
  return fullmatch("(?:consequence|consequences|trade[- ]off|trade[- ]offs)\\s*[:：]?", "i", candidate);
}

function hasFollowingConsequencePayload(units: string[], startIndex: number): boolean {
  for (const payload of units.slice(startIndex + 1)) {
    if (!payload.trim()) continue;
    if (isBareConsequenceLabel(payload)) continue;
    if (search(NEGATED_CONSEQUENCE_RE, payload)) continue;
    if (hasExplanatoryConsequencePayload(payload)) return true;
  }
  return false;
}

function hasAffirmativeConsequence(text: string): boolean {
  const units = text.split(/[\n.;]+/);
  for (let index = 0; index < units.length; index++) {
    const unit = units[index];
    const matches = [...unit.matchAll(new RegExp(CONSEQUENCE_RE.source, "gi"))];
    if (matches.length === 0) continue;
    if (search(NEGATED_CONSEQUENCE_RE, unit)) continue;
    if (isBareConsequenceLabel(unit) && hasFollowingConsequencePayload(units, index)) return true;
    for (const match of matches) {
      if (hasExplanatoryConsequencePayload(unit.slice(match.index + match[0].length))) return true;
    }
  }
  return false;
}

const PATTERN_RE = /\bpattern\b/i;
const DECISION_REF_RE = /\bADR[- #]*\d{4}\b|(?:^|[/\s(])\d{4}-[A-Za-z0-9-]+\.md\b/i;

function markdownBlockValue(line: string): string | null {
  const indent = lineIndent(line);
  if (indent > 3) return null;
  const value = line.replace(/^ +/, "");
  if (/^(?:[-*+]\s+|\d+\.\s+|>\s*|#{1,6}\s+)/.test(value) || value.startsWith("|")) return value;
  return null;
}

function isCostClaimBoundary(line: string, sectionName = ""): boolean {
  const value = line.trim();
  const hasPattern = search(PATTERN_RE, value);
  if (!(hasPattern || search(DECISION_REF_RE, value))) return false;
  const indent = lineIndent(line);
  if (indent === 0) {
    return (
      /^(?:[-*+]\s+|\d+\.\s+|>\s*|#{1,6}\s+)/.test(value) ||
      value.startsWith("|") ||
      /^(?:Pattern|Decision|ADR[- #]*\d{4})\b/i.test(value)
    );
  }
  if (sectionName === "08-crosscutting-concepts.md") return markdownBlockValue(line) !== null;
  return false;
}

function isProsePatternClaim(value: string): boolean {
  return /\b(?:uses?|adopts?|implements?|instantiates?|rel(?:y|ies) on|depends? on|in use)\b.*\bpattern\b|\bpattern\b.*\b(?:uses?|adopted|implemented|instantiated|relied on|depended on|in use)\b/i.test(
    value,
  );
}

function isCostClaimLine(line: string, sectionName = ""): boolean {
  const value = line.trim();
  if (search(DECISION_REF_RE, value)) return true;
  if (!search(PATTERN_RE, value)) return false;
  if (sectionName === "08-crosscutting-concepts.md") {
    if (isCostClaimBoundary(line, sectionName)) return true;
    return lineIndent(line) === 0 && isProsePatternClaim(value);
  }
  if (isCostClaimBoundary(line, sectionName)) return true;
  return isProsePatternClaim(value);
}

function isTableHeaderRow(rows: Row[], index: number): boolean {
  const value = rows[index][1].trim();
  if (!isTableRow(value) || isTableSeparatorRow(value)) return false;
  return index + 1 < rows.length && isTableSeparatorRow(rows[index + 1][1].trim());
}

function isPatternCatalogueHeading(value: string): boolean {
  let candidate = value.replace(/^#{1,6}\s+/, "").trim();
  candidate = candidate.replace(/[*_`]+/g, "").trim();
  const normalized = candidate.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return [
    "pattern",
    "patterns",
    "pattern catalog",
    "pattern catalogue",
    "pattern inventory",
    "pattern register",
    "patterns catalog",
    "patterns catalogue",
    "design patterns",
    "crosscutting patterns",
  ].includes(normalized);
}

function isClaimScaffoldingRow(rows: Row[], index: number): boolean {
  const value = rows[index][1].trim();
  if (value.startsWith("#") && search(PATTERN_RE, value) && !hasAffirmativeConsequence(value)) {
    return isPatternCatalogueHeading(value);
  }
  if (isTableSeparatorRow(value)) return true;
  if (isTableHeaderRow(rows, index) && search(PATTERN_RE, value) && !hasAffirmativeConsequence(value)) {
    return true;
  }
  return false;
}

function tableClaimHasConsequencePayload(rows: Row[], index: number): boolean {
  const value = rows[index][1].trim();
  if (!isTableRow(value) || isTableSeparatorRow(value) || isTableHeaderRow(rows, index)) return false;
  let headerValue: string | null = null;
  for (let candidate = index - 1; candidate >= 0; candidate--) {
    const candidateValue = rows[candidate][1].trim();
    if (!isTableRow(candidateValue)) break;
    if (isTableSeparatorRow(candidateValue) && candidate - 1 >= 0) {
      const previousValue = rows[candidate - 1][1].trim();
      if (isTableRow(previousValue) && !isTableSeparatorRow(previousValue)) {
        headerValue = previousValue;
      }
      break;
    }
  }
  if (headerValue === null) return false;
  const headerCells = tableCells(headerValue);
  const valueCells = tableCells(value);
  const n = Math.min(headerCells.length, valueCells.length);
  for (let i = 0; i < n; i++) {
    if (!search(CONSEQUENCE_RE, headerCells[i])) continue;
    if (search(NEGATED_CONSEQUENCE_RE, valueCells[i])) continue;
    if (hasExplanatoryConsequencePayload(valueCells[i])) return true;
  }
  return false;
}

function checkStatedCost(): string[] {
  printCheck("stated-cost");
  const local: string[] = [];

  const anyCostText = allMd.map((p) => stripHtmlComments(readText(p))).join("\n");
  if (!hasAffirmativeConsequence(anyCostText)) {
    local.push("architecture tree: no stated consequence, trade-off, or cost found");
  }

  for (const p of allMd) {
    const rows = contentLines(p);
    const name = path.basename(p);
    for (let idx = 0; idx < rows.length; idx++) {
      const [lineNo, line] = rows[idx];
      const value = line.trim();
      if (!value) continue;
      if (isClaimScaffoldingRow(rows, idx)) continue;
      const isClaim = isCostClaimLine(line, name);
      if (value.startsWith("#") && !isClaim) continue;
      const lower = value.toLowerCase();
      if (lower.startsWith("link:") || lower.startsWith("source:") || lower.startsWith("evidence:")) {
        continue;
      }
      if (!isClaim) continue;
      if (
        name === "09-architecture-decisions.md" &&
        search(DECISION_REF_RE, value) &&
        !search(PATTERN_RE, value)
      ) {
        continue;
      }
      let claimText: string;
      if (value.startsWith("#") && hasAffirmativeConsequence(value)) {
        claimText = value;
      } else {
        claimText = currentClaimBlock(rows, idx, (candidate) => isCostClaimLine(candidate, name));
      }
      if (!(hasAffirmativeConsequence(claimText) || tableClaimHasConsequencePayload(rows, idx))) {
        local.push(`${p}:${lineNo}: ${value}`);
      }
    }
  }
  if (local.length > 0) failCheck("stated-cost", local);
  else passCheck("stated-cost");
  return local;
}

// The grounding tool is now TypeScript; invoke it with bun. ARCH_LINT_WAF_GROUNDING keeps
// its meaning as an explicit override.
function findWafGroundingCommand(): string | null {
  const explicit = process.env.ARCH_LINT_WAF_GROUNDING;
  if (explicit) return isFile(explicit) ? explicit : null;
  const candidate = path.join(process.cwd(), "tools", "waf-grounding.ts");
  if (isFile(candidate)) return candidate;
  return null;
}

function resolveWithWafGrounding(
  command: string,
  bpIds: string[],
): [Record<string, Record<string, unknown>> | null, string[]] {
  const cmd = [command];
  const corpusDir = process.env.ARCH_LINT_CORPUS_DIR;
  const lookup = process.env.ARCH_LINT_WA_LOOKUP;
  if (corpusDir) cmd.push("--corpus-dir", corpusDir);
  if (lookup) cmd.push("--lookup", lookup);
  cmd.push("resolve", "--format", "json");
  cmd.push(...[...bpIds].sort());
  const timeout = Math.max(30, bpIds.length) * 1000;
  const result = spawnSync("bun", cmd, { encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) {
    return [null, [`corpus grounding lookup failed: ${(result.error as Error).message}`]];
  }
  const stderr = (result.stderr ?? "").trim();
  const stdout = (result.stdout ?? "").trim();
  if (result.status === 3) {
    const detail = stderr || stdout || "corpus source missing";
    return [null, [`__WAF_GROUNDING_SOURCE_MISSING__${detail}`]];
  }
  if (result.status === 2) {
    const detail = stderr || stdout || "corpus sync required";
    return [null, [detail]];
  }
  if (result.status !== 0) {
    const detail = stderr || stdout || "best-practice identifier did not resolve";
    return [null, [detail]];
  }
  let payload: unknown;
  try {
    payload = JSON.parse(result.stdout ?? "");
  } catch (e) {
    return [null, [`corpus grounding returned invalid JSON: ${(e as Error).message}`]];
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !Array.isArray((payload as Record<string, unknown>)["best_practices"])
  ) {
    return [null, ["corpus grounding returned an unexpected shape"]];
  }
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const item of (payload as Record<string, unknown>)["best_practices"] as unknown[]) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return [null, ["corpus grounding returned a non-object best-practice record"]];
    }
    const record = item as Record<string, unknown>;
    const bpId = record["id"];
    const risk = record["risk_level"];
    const source = record["source_url"];
    if (typeof bpId !== "string" || !fullmatch(BP_FULL_SRC, "", bpId)) {
      return [null, ["corpus grounding returned an invalid best-practice id"]];
    }
    if (risk !== "HIGH" && risk !== "MEDIUM" && risk !== "LOW") {
      return [null, [`corpus grounding returned invalid frontmatter risk for ${bpId}`]];
    }
    if (typeof source !== "string" || !source.startsWith("https://")) {
      return [null, [`corpus grounding returned invalid source URL for ${bpId}`]];
    }
    resolved[bpId] = record;
  }
  return [resolved, []];
}

function checkBestPracticeIdentifiers(): string[] {
  printCheck("best-practice identifier resolution");
  const found = new Map<string, string[]>();
  for (const p of allMd) {
    const text = readText(p);
    splitlines(text).forEach((line, i) => {
      for (const match of line.matchAll(new RegExp(BP_RE_SRC, "g"))) {
        const key = match[0];
        if (!found.has(key)) found.set(key, []);
        found.get(key)!.push(`${p}:${i + 1}`);
      }
    });
  }
  if (found.size === 0) {
    print("best-practice identifier resolution: ok (no Well-Architected identifiers found)");
    return [];
  }

  const local: string[] = [];
  const grounding = findWafGroundingCommand();
  if (!grounding) {
    skipped += 1;
    print(
      `best-practice identifier resolution: SKIP — no WAF grounding tool configured (${found.size} identifier(s) unchecked)`,
    );
    return [];
  }
  const [resolved, errors] = resolveWithWafGrounding(grounding, [...found.keys()]);
  if (errors.length > 0 && errors.every((e) => e.startsWith("__WAF_GROUNDING_SOURCE_MISSING__"))) {
    skipped += 1;
    const detail = errors[0].replace("__WAF_GROUNDING_SOURCE_MISSING__", "");
    print(
      `best-practice identifier resolution: SKIP — no corpus source available (${found.size} identifier(s) unchecked): ${detail}`,
    );
    return [];
  }
  if (errors.length > 0) {
    local.push(...errors);
  } else if (resolved === null) {
    local.push("WAF grounding did not return identifier metadata");
  } else {
    const sortedIds = [...found.keys()].sort();
    for (const bpId of sortedIds) {
      if (!(bpId in resolved)) {
        local.push(`${bpId} at ${found.get(bpId)!.join(", ")} (lookup returned no metadata)`);
      }
    }
  }

  if (local.length > 0) failCheck("best-practice identifier resolution", local);
  else passCheck("best-practice identifier resolution");
  return local;
}

const MET_CLAIM_RE =
  /(?:\b(?:status|state)\s*[:=-]\s*met\b|(?:^|[\s|:;—,.)\]-])(?<!not\s)(?<!partial\s)(?<!partially\s)met(?:[\s|:;—,.)\]-]|$))/i;

function checkMetEvidence(): string[] {
  printCheck("evidence-for-met");
  const local: string[] = [];
  for (const p of allMd) {
    const rows = contentLines(p);
    for (let idx = 0; idx < rows.length; idx++) {
      const [lineNo, line] = rows[idx];
      const ids = [...line.matchAll(new RegExp(BP_RE_SRC, "g"))].map((m) => m[0]);
      if (ids.length === 0) continue;
      const claimText = bestPracticeClaimBlock(rows, idx);
      if (search(MET_CLAIM_RE, claimText) && !hasRepoFileLineCitation(claimText)) {
        const unique = [...new Set(ids)].sort();
        local.push(`${p}:${lineNo}: ${unique.join(", ")} recorded as met without file:line evidence`);
      }
    }
  }
  if (local.length > 0) failCheck("evidence-for-met", local);
  else passCheck("evidence-for-met");
  return local;
}

function checkAdrExistence(): string[] {
  printCheck("ADR existence");
  const local: string[] = [];
  const p = path.join(TREE, "09-architecture-decisions.md");
  if (exists(p)) {
    for (const [lineNo, line] of contentLines(p)) {
      const refs = new Set<string>();
      for (const m of line.matchAll(/\bADR[- #]*(\d{4})\b/gi)) refs.add(m[1]);
      for (const m of line.matchAll(/(?:^|[/\s(])(\d{4})-[A-Za-z0-9-]+\.md\b/g)) refs.add(m[1]);
      for (const ref of [...refs].sort()) {
        const matches = globPrefix(DECISIONS, ref);
        if (matches.length === 0) {
          local.push(`ADR ${ref} referenced at ${p}:${lineNo} but no ${DECISIONS}/${ref}-*.md exists`);
        }
      }
    }
  }
  if (local.length > 0) failCheck("ADR existence", local);
  else passCheck("ADR existence");
  return local;
}

function checkSectionCompleteness(): string[] {
  printCheck("section completeness");
  const local: string[] = [];

  const notApplicableHasOneLineReason = (line: string): boolean => {
    for (const match of line.matchAll(/\bNot applicable\b([^\n]*)/gi)) {
      if (!hasTextualPayload(match[1])) return false;
    }
    return true;
  };

  for (const rel of ["README.md", ...EXPECTED_SECTIONS]) {
    const p = path.join(TREE, rel);
    if (!isFile(p)) {
      local.push(`missing ${p}`);
      continue;
    }
    const rows = contentLines(p);
    const h1 = rows.filter(([, line]) => line.startsWith("# "));
    if (h1.length !== 1) {
      local.push(`${p}: expected exactly one H1, found ${h1.length}`);
    }
    const body = nonemptyContentAfterH1(p);
    if (body.length === 0) {
      local.push(`${p}: no content and no declared non-applicability`);
      continue;
    }
    for (const [, line] of body) {
      if (/\bNot applicable\b/i.test(line) && !notApplicableHasOneLineReason(line)) {
        local.push(`${p}: Not applicable declaration needs a one-line reason`);
        break;
      }
    }
  }
  if (local.length > 0) failCheck("section completeness", local);
  else passCheck("section completeness");
  return local;
}

function isIso42010ConformanceClaim(line: string): boolean {
  const lower = line.toLowerCase();
  if (!lower.includes("42010") || !lower.includes("iso")) return false;
  if (
    !/\b(conform\w*|complian\w*|comply\w*|meet(?:s|ing)?|satisf(?:y|ies|ied)|adhere(?:s|d)?|adhering)\b/i.test(
      line,
    )
  ) {
    return false;
  }
  return !/\b(no|not|never|without|cannot|can't|won't|doesn't|does\s+not|do\s+not|is\s+not|are\s+not)\b/i.test(
    line,
  );
}

function extractAdrRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const m of text.matchAll(/\bADR[- #]*(\d{4})\b/gi)) refs.add(m[1]);
  for (const m of text.matchAll(/(?:^|[/\s(])(\d{4})-[A-Za-z0-9-]+\.md\b/g)) refs.add(m[1]);
  return [...refs].sort();
}

function linkedAdrPaths(ref: string): string[] {
  return globPrefix(DECISIONS, ref);
}

function isDecisionEntry(line: string): boolean {
  const value = line.trim();
  if (!value || value.startsWith("#") || fullmatch("[|:\\-\\s]+", "", value)) return false;
  const lower = value.toLowerCase();
  if (lower.startsWith("link:") || lower.startsWith("source:") || lower.startsWith("evidence:")) {
    return false;
  }
  if (extractAdrRefs(value).length > 0) return true;
  return /^(?:[-*+]\s*)?decision\b/i.test(value);
}

function markdownSectionHasBody(
  text: string,
  headingRe: RegExp,
  bodyPredicate?: (line: string) => boolean,
): boolean {
  let inSection = false;
  for (const rawLine of splitlines(text)) {
    const line = rawLine.trim();
    if (/^#{1,6}\s+/.test(line)) {
      if (inSection) return false;
      inSection = search(headingRe, line);
      continue;
    }
    if (inSection && line && line !== "---") {
      if (bodyPredicate === undefined || bodyPredicate(line)) return true;
    }
  }
  return false;
}

function hasRationaleDetail(text: string): boolean {
  for (const rawLine of splitlines(text)) {
    const line = rawLine.trim();
    if (!line || !/\brationale\b/i.test(line)) continue;
    if (fullmatch("#{1,6}\\s+rationale\\s*", "i", line)) continue;
    if (/\b(no|not|without|missing|lacks?)\b(?:\W+\w+){0,3}\W+rationale\b/i.test(line)) continue;
    if (/\brationale\b\W+(?:missing|absent|unknown|pending|none|not\W+available)\b/i.test(line)) {
      continue;
    }
    const lineWithoutTables = stripChars(line, "| #");
    if (fullmatch("rationale\\s*", "i", lineWithoutTables)) continue;
    if (
      fullmatch(
        "(?:decision|adr|status|title|link|rationale)(?:\\s*\\|\\s*(?:decision|adr|status|title|link|rationale))*",
        "i",
        lineWithoutTables,
      )
    ) {
      continue;
    }
    const rationaleValue = line.match(/\brationale\s*[:—-]\s*(.*)$/i);
    if (rationaleValue) {
      if (hasNonPlaceholderPayload(rationaleValue[1])) return true;
      continue;
    }
    let remainder = line.replace(/\brationale\b/gi, "");
    remainder = remainder.replace(/[|#:—\-\s]/g, " ");
    if (hasNonPlaceholderPayload(remainder)) return true;
  }
  return false;
}

function hasAdrRationale(text: string): boolean {
  const clean = stripHtmlComments(text);
  if (hasRationaleDetail(clean)) return true;
  return markdownSectionHasBody(
    clean,
    /^#{1,6}\s+(?:Decision Outcome|Rationale)\b/i,
    hasNonPlaceholderPayload,
  );
}

function normalize42010LabelLine(line: string): string {
  let value = stripChars(line.trim(), "|").trim();
  value = value.replace(/^#{1,6}\s+/, "");
  value = value.replace(/^(?:[-*+]|\d+[.)])\s+/, "");
  value = value.replace(/^\[[ xX]\]\s+/, "");
  value = stripChars(value, "*_ ");
  value = value.replace(/^(stakeholders?|concerns?)\*\*/i, "$1");
  return value;
}

function has42010LabelPayload(text: string, labelRe: RegExp): boolean {
  const rows = splitlines(text);
  const any42010LabelRe = /^(?:stakeholders?|concerns?)\b/i;
  for (let index = 0; index < rows.length; index++) {
    const value = normalize42010LabelLine(rows[index]);
    const match = new RegExp("^(?:" + labelRe.source + ")", labelRe.flags.replace("g", "")).exec(value);
    if (!match) continue;
    const trailing = value.slice(match[0].length).trim();
    const payloadMatch = trailing.match(/^(?::|—|-|\||are\b|includes?\b|identified as\b)\s*(.*)$/i);
    if (payloadMatch) {
      if (hasNonPlaceholderPayload(payloadMatch[1])) return true;
      continue;
    }
    if (trailing) continue;
    for (const nextRawLine of rows.slice(index + 1)) {
      const nextValue = normalize42010LabelLine(nextRawLine);
      if (!nextValue) continue;
      if (nextRawLine.trim().startsWith("#") || any42010LabelRe.test(nextValue)) break;
      if (hasNonPlaceholderPayload(nextValue)) return true;
    }
  }
  return false;
}

function hasPresentedViewContent(sectionName: string): boolean {
  const p = path.join(TREE, sectionName);
  if (!isFile(p)) return false;
  for (const [, value] of nonemptyContentAfterH1(p)) {
    const normalized = value.replace(/[*_`"'“”‘’]/g, "").toLowerCase().trim();
    if (!hasNonPlaceholderPayload(value)) continue;
    if (/\bnot applicable\b/.test(normalized)) continue;
    if (
      /\b(?:no|not|without|missing|absent|omitted)\b(?:\W+\w+){0,5}\W+views?\b|\bviews?\b(?:\W+\w+){0,5}\W+(?:not\W+(?:presented|included|applicable|available)|missing|absent|omitted|none)\b/i.test(
        normalized,
      )
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function check42010Audit(): string[] {
  printCheck("42010 audit checklist");
  const local: string[] = [];
  const texts = new Map<string, string>();
  for (const p of allMd) texts.set(path.basename(p), stripHtmlComments(readText(p)));
  for (const p of allMd) {
    splitlines(stripHtmlComments(readText(p))).forEach((line, i) => {
      if (isIso42010ConformanceClaim(line)) {
        local.push(`${p}:${i + 1}: ISO 42010 conformance claim is not allowed`);
      }
    });
  }

  const sec1 = texts.get("01-introduction-and-goals.md") ?? "";
  if (!has42010LabelPayload(sec1, /stakeholders?\b/i)) {
    local.push("01-introduction-and-goals.md: missing stakeholders");
  }
  if (!has42010LabelPayload(sec1, /concerns?\b/i)) {
    local.push("01-introduction-and-goals.md: missing concerns");
  }

  const viewSections = [
    "03-context-and-scope.md",
    "05-building-block-view.md",
    "06-runtime-view.md",
    "07-deployment-view.md",
  ];
  if (!viewSections.some((name) => hasPresentedViewContent(name))) {
    local.push("architecture tree: missing presented views");
  }

  const sec9 = texts.get("09-architecture-decisions.md") ?? "";
  if (!/\b(ADR|decision)\b/i.test(sec9)) {
    local.push("09-architecture-decisions.md: missing decisions");
  }
  const section9Path = path.join(TREE, "09-architecture-decisions.md");
  if (isFile(section9Path)) {
    const decisionRows = contentLines(section9Path);
    const decisionIndices: number[] = [];
    decisionRows.forEach(([, line], idx) => {
      if (isDecisionEntry(line)) decisionIndices.push(idx);
    });
    if (decisionIndices.length === 0) {
      local.push("09-architecture-decisions.md: missing decision entries with linked ADR rationale");
    }
    for (const idx of decisionIndices) {
      const [lineNo, line] = decisionRows[idx];
      const decisionText = currentClaimBlock(decisionRows, idx, isDecisionEntry);
      const refs = extractAdrRefs(decisionText);
      if (refs.length === 0) {
        local.push(
          `${section9Path}:${lineNo}: decision entry has no ADR reference for rationale lookup — ${line.trim()}`,
        );
        continue;
      }
      for (const ref of refs) {
        const matches = linkedAdrPaths(ref);
        if (matches.length === 0) continue;
        if (!matches.some((m) => hasAdrRationale(readText(m)))) {
          local.push(
            `${section9Path}:${lineNo}: linked ADR ${ref} lacks rationale in ${DECISIONS}/${ref}-*.md`,
          );
        }
      }
    }
  } else {
    local.push("09-architecture-decisions.md: missing decision entries with linked ADR rationale");
  }
  if (local.length > 0) failCheck("42010 audit checklist", local);
  else passCheck("42010 audit checklist");
  return local;
}

function checkHtmlFreshness(): string[] {
  printCheck("html freshness");
  const local: string[] = [];
  const htmlPath = path.join(TREE, "index.html");
  if (!exists(htmlPath)) {
    local.push(`${htmlPath}: missing render — run 'just architecture-html'`);
    failCheck("html freshness", local);
    return local;
  }
  let fresh: string;
  try {
    fresh = renderTree(TREE);
  } catch (err) {
    // A render failure here is a symptom of an incomplete tree, which the section
    // completeness check already reports. Surface it without double-counting the cause.
    local.push(`could not render the tree for comparison: ${(err as Error).message}`);
    failCheck("html freshness", local);
    return local;
  }
  const committed = fs.readFileSync(htmlPath, "utf8");
  if (committed !== fresh) {
    local.push(`${htmlPath}: stale — not a current render of the markdown; run 'just architecture-html'`);
  }
  if (local.length > 0) failCheck("html freshness", local);
  else passCheck("html freshness");
  return local;
}

// arc42 sections whose diagrams are load-bearing. Required: a missing Mermaid block fails.
// Conventional: a missing block warns but does not fail. Every other section is prose/table.
const DIAGRAM_REQUIRED = new Set([
  "03-context-and-scope.md",
  "05-building-block-view.md",
  "07-deployment-view.md",
]);
const DIAGRAM_CONVENTIONAL = new Set([
  "06-runtime-view.md",
  "10-quality-requirements.md",
]);

function hasMermaidBlock(text: string): boolean {
  return /```+\s*mermaid\b/i.test(text);
}

function checkDiagramPresence(): string[] {
  printCheck("diagram presence");
  const local: string[] = [];
  for (const section of EXPECTED_SECTIONS) {
    const p = path.join(TREE, section);
    if (!exists(p)) continue; // section completeness owns missing files
    const text = stripHtmlComments(readText(p));
    if (hasMermaidBlock(text)) continue;
    if (DIAGRAM_REQUIRED.has(section)) {
      local.push(`${section}: no Mermaid diagram — this section requires one`);
    } else if (DIAGRAM_CONVENTIONAL.has(section)) {
      print(`diagram presence: WARN — ${section}: no Mermaid diagram (conventional, not required)`);
    }
  }
  if (local.length > 0) failCheck("diagram presence", local);
  else passCheck("diagram presence");
  return local;
}

function mermaidValidator(): string[] | null {
  // Prefer a validator on PATH; fall back to bunx-fetched maid so the check runs out of the box
  // with bun. Returns the argv prefix (a file path is appended per block), or null when none is
  // reachable (offline with nothing installed) so the check degrades to PARTIAL, never a false
  // clean. Order matters: an installed binary beats a network fetch. Probed by validating a
  // known-good diagram, since maid has no --version flag (it reads argv as file paths).
  const probeFile = path.join(os.tmpdir(), `arch-lint-mmd-probe-${process.pid}.mmd`);
  fs.writeFileSync(probeFile, "flowchart LR\n  a --> b\n");
  try {
    const candidates: string[][] = [["maid"], ["mmdc"], ["bunx", "--bun", "@probelabs/maid"]];
    for (const cand of candidates) {
      const isMmdc = cand[cand.length - 1] === "mmdc";
      const argv = isMmdc
        ? [...cand.slice(1), "-i", probeFile, "-o", `${probeFile}.svg`]
        : [...cand.slice(1), probeFile];
      const probe = spawnSync(cand[0], argv, { encoding: "utf8" });
      if (!probe.error && probe.status === 0) return cand;
    }
    return null;
  } finally {
    try { fs.unlinkSync(probeFile); } catch { /* best effort */ }
    try { fs.unlinkSync(`${probeFile}.svg`); } catch { /* best effort */ }
  }
}

function extractMermaidBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = splitlines(text);
  let i = 0;
  while (i < lines.length) {
    if (/```+\s*mermaid\b/i.test(lines[i].trim())) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```+\s*$/.test(lines[i].trim())) { body.push(lines[i]); i++; }
      blocks.push(body.join("\n"));
    }
    i++;
  }
  return blocks;
}

function checkDiagramSyntax(): string[] {
  printCheck("diagram syntax");
  const local: string[] = [];
  const validator = mermaidValidator();
  const jobs: Array<{ section: string; source: string }> = [];
  for (const p of allMd) {
    for (const source of extractMermaidBlocks(stripHtmlComments(readText(p)))) {
      jobs.push({ section: path.basename(p), source });
    }
  }
  if (jobs.length === 0) {
    print("diagram syntax: ok (no Mermaid blocks found)");
    return local;
  }
  if (!validator) {
    skipped += 1;
    print(`diagram syntax: SKIP — no Mermaid validator (maid or mmdc) installed (${jobs.length} block(s) unchecked)`);
    return local;
  }
  for (const job of jobs) {
    const tmp = path.join(os.tmpdir(), `arch-lint-mmd-${process.pid}-${Math.abs(hashString(job.source))}.mmd`);
    fs.writeFileSync(tmp, job.source);
    try {
      const isMmdc = validator[validator.length - 1] === "mmdc";
      const argv = isMmdc
        ? [...validator.slice(1), "-i", tmp, "-o", `${tmp}.svg`]
        : [...validator.slice(1), tmp];
      const out = spawnSync(validator[0], argv, { encoding: "utf8" });
      if (out.status !== 0) {
        const detail = (out.stderr || out.stdout || "parse error").trim().split("\n")[0];
        local.push(`${job.section}: invalid Mermaid — ${detail}`);
      }
    } finally {
      try { fs.unlinkSync(tmp); } catch { /* best effort */ }
      try { fs.unlinkSync(`${tmp}.svg`); } catch { /* best effort */ }
    }
  }
  if (local.length > 0) failCheck("diagram syntax", local);
  else passCheck("diagram syntax");
  return local;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return h;
}

const checks = [
  checkStatedCost,
  checkBestPracticeIdentifiers,
  checkMetEvidence,
  checkAdrExistence,
  checkSectionCompleteness,
  check42010Audit,
  checkDiagramPresence,
  checkDiagramSyntax,
  checkHtmlFreshness,
];
for (const check of checks) failures.push(...check());

if (failures.length > 0) {
  if (skipped) print(`arch-lint: FAIL — ${failures.length} violation(s); ${skipped} check(s) skipped`);
  else print(`arch-lint: FAIL — ${failures.length} violation(s)`);
  // exitCode, not exit(): process.exit() truncates buffered stdout on a pipe.
  process.exitCode = 1;
} else if (skipped) {
  print(`arch-lint: PARTIAL — ${skipped} check(s) skipped, architecture NOT fully checked`);
} else {
  print("arch-lint: clean (all checks ran)");
}
