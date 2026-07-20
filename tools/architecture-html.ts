#!/usr/bin/env bun
// Architecture HTML renderer.
//
// Reads the arc42 markdown tree under docs/architecture/ and renders a single
// self-contained docs/architecture/index.html, sharing one theme with the evolution
// timeline. The markdown is the source of truth and the arch-lint gate target; this HTML
// is a derived, deterministic render. A zero-dependency focused markdown renderer covers
// exactly the constructs the architecture-writer emits (headings, dash lists, pipe tables,
// inline code, links, emphasis) -- controlled input, safe subset.
//
// Usage:
//   bun tools/architecture-html.ts [treeDir] [--out <file>]
// Defaults: treeDir="docs/architecture", out="<treeDir>/index.html".
//
// Regex literals are fine here: the no-regex-literal rule is for extensions/*/index.ts.

import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inlineTheme } from "./lib/theme.ts";

// ---------- types ----------

export interface Section { id: string; num: string; title: string; html: string; }
export interface Provenance {
  commit: string; date: string; corpusTag: string; corpusHash: string;
}
export interface CrosswalkRow { section: string; hld: string; lld: string; }
export interface ArchModel {
  title: string;
  provenance: Provenance;
  crosswalk: CrosswalkRow[];
  sections: Section[];
}

// ---------- markdown renderer (zero-dependency, focused subset) ----------

/** Escape the five HTML-significant characters. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Render inline spans: `code`, [text](url), **bold**, *italic*. Escapes first, so code
 *  and link text are safe. Code spans are extracted before other spans to protect them. */
export function renderInline(text: string): string {
  // Split on backticks: odd-indexed segments are code spans (rendered literally, escaped),
  // even-indexed segments are prose (links, bold, italic). No placeholder dance, so nothing
  // can leak a sentinel and table-cell trim() cannot strip a boundary marker.
  const parts = text.split("`");
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out += `<code>${escapeHtml(parts[i])}</code>`;
      continue;
    }
    let seg = escapeHtml(parts[i]);
    seg = seg.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (_m, label, href) => {
      const safe = /^(https?:\/\/|\/|\.|#|[\w.\/-]+(:\d+)?)$/.test(href) ? href : "#";
      return `<a href="${safe}">${label}</a>`;
    });
    seg = seg.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    seg = seg.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
    out += seg;
  }
  return out;
}

interface TableAcc { header: string[]; rows: string[][]; }

function renderTable(t: TableAcc): string {
  const head = t.header.map((c) => `<th>${renderInline(c)}</th>`).join("");
  const body = t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/** Render a markdown block into HTML. Supports ATX headings (h1-h6), dash unordered lists,
 *  pipe tables, and paragraphs, with inline spans inside each. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  let list: string[] = [];
  let listTag: "ul" | "ol" = "ul";

  const flushPara = () => {
    if (para.length) { out.push(`<p>${renderInline(para.join(" "))}</p>`); para = []; }
  };
  const flushList = () => {
    if (list.length) {
      out.push(`<${listTag}>${list.map((li) => `<li>${renderInline(li)}</li>`).join("")}</${listTag}>`);
      list = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { flushPara(); flushList(); i++; continue; }

    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2].trim())}</h${level}>`);
      i++; continue;
    }

    // Fenced code block. A ```mermaid fence becomes <pre class="mermaid"> so the runtime
    // renders it as a diagram; any other language becomes an ordinary escaped code block.
    // The body is HTML-escaped either way: the browser decodes entities in textContent, so
    // mermaid still sees the literal source, and a stray < in a diagram cannot break the DOM.
    const fence = trimmed.match(/^```+\s*([A-Za-z0-9_-]*)\s*$/);
    if (fence) {
      flushPara(); flushList();
      const lang = fence[1].toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```+\s*$/.test(lines[i].trim())) {
        body.push(lines[i]); i++;
      }
      if (i < lines.length) i++; // consume closing fence
      const code = escapeHtml(body.join("\n"));
      out.push(lang === "mermaid"
        ? `<pre class="mermaid">${code}</pre>`
        : `<pre><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>`);
      continue;
    }

    // Table: a pipe row followed by a separator row.
    if (trimmed.startsWith("|") && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flushPara(); flushList();
      const header = splitRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i])); i++;
      }
      out.push(renderTable({ header, rows }));
      continue;
    }

    const uli = trimmed.match(/^[-*+]\s+(.*)$/);
    if (uli) {
      flushPara();
      if (list.length && listTag !== "ul") flushList();
      listTag = "ul"; list.push(uli[1]); i++; continue;
    }
    const oli = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (oli) {
      flushPara();
      if (list.length && listTag !== "ol") flushList();
      listTag = "ol"; list.push(oli[1]); i++; continue;
    }

    // A non-blank line while a list is open is a wrapped continuation of the current item,
    // not a new paragraph. A blank line (handled above) is what ends a list.
    if (list.length > 0) { list[list.length - 1] += " " + trimmed; i++; continue; }

    para.push(trimmed);
    i++;
  }
  flushPara(); flushList();
  return out.join("\n");
}

// ---------- model extraction ----------

const SECTION_FILES: Array<[string, string]> = [
  ["01", "01-introduction-and-goals.md"],
  ["02", "02-constraints.md"],
  ["03", "03-context-and-scope.md"],
  ["04", "04-solution-strategy.md"],
  ["05", "05-building-block-view.md"],
  ["06", "06-runtime-view.md"],
  ["07", "07-deployment-view.md"],
  ["08", "08-crosscutting-concepts.md"],
  ["09", "09-architecture-decisions.md"],
  ["10", "10-quality-requirements.md"],
  ["11", "11-risks-and-technical-debt.md"],
  ["12", "12-glossary.md"],
];

function firstH1(md: string): string {
  const m = md.match(/^#\s+(.*)$/m);
  return m ? m[1].trim() : "";
}

/** Body after the first H1 line. */
function bodyAfterH1(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const idx = lines.findIndex((l) => /^#\s+/.test(l));
  return idx === -1 ? md : lines.slice(idx + 1).join("\n").trim();
}

function extractProvenance(readme: string): Provenance {
  const grab = (label: string): string => {
    const m = readme.match(new RegExp(`${label}:\\s*\`?([^\`\\n]+)\`?`, "i"));
    return m ? m[1].trim().replace(/`/g, "") : "";
  };
  return {
    commit: grab("Source commit"),
    date: grab("Generation date"),
    corpusTag: grab("corpus tag"),
    corpusHash: grab("corpus content hash"),
  };
}

function extractCrosswalk(readme: string): CrosswalkRow[] {
  const rows: CrosswalkRow[] = [];
  const lines = readme.split("\n");
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("| arc42 section")) { inTable = true; i++; continue; }
    if (inTable) {
      if (!t.startsWith("|")) break;
      const c = splitRow(t);
      if (c.length >= 3) rows.push({ section: c[0], hld: c[1], lld: c[2] });
    }
  }
  return rows;
}

export function buildModel(treeDir: string): ArchModel {
  const readmePath = join(treeDir, "README.md");
  if (!existsSync(readmePath)) {
    throw new Error(`architecture-html: no README.md in ${treeDir}`);
  }
  const readme = readFileSync(readmePath, "utf8");
  const sections: Section[] = [];
  for (const [num, file] of SECTION_FILES) {
    const p = join(treeDir, file);
    if (!existsSync(p)) throw new Error(`architecture-html: missing section file ${file}`);
    const md = readFileSync(p, "utf8");
    const title = firstH1(md).replace(/^\d+\.\s*/, "");
    sections.push({
      id: file.replace(/\.md$/, ""),
      num,
      title,
      html: renderMarkdown(bodyAfterH1(md)),
    });
  }
  return {
    title: firstH1(readme) || "Architecture description",
    provenance: extractProvenance(readme),
    crosswalk: extractCrosswalk(readme),
    sections,
  };
}

// ---------- render ----------

/** The pinned Mermaid runtime as a string, for inlining. Deterministic: the vendored file is
 *  byte-stable, so the generated HTML is byte-stable and the freshness hash holds. */
export function mermaidRuntime(): string {
  return readFileSync(join(HERE, "lib", "mermaid.min.js"), "utf8");
}

/** Serialise the model into the template at __MODEL__, inline the shared theme, and inline the
 *  pinned Mermaid runtime at __MERMAID__. Fail loud on a missing injection point. Deterministic:
 *  no wall-clock, fixed section order, byte-stable runtime. */
export function render(template: string, model: ArchModel): string {
  const json = JSON.stringify(model);
  const safe = json.replace(/<\/(script)/gi, "<\\/$1");
  if (/<\/script/i.test(safe)) {
    throw new Error("model JSON still contains a script terminator after escaping");
  }
  if (!template.includes("__MODEL__")) {
    throw new Error("template is missing the __MODEL__ injection point");
  }
  // Validate the theme slot before the Mermaid slot so the prior renderer contract holds: a
  // template missing both reports the theme error first (inlineTheme owns that check).
  const themed = inlineTheme(template);
  if (!themed.includes("__MERMAID__")) {
    throw new Error("template is missing the __MERMAID__ injection point");
  }
  return themed
    .replace("__MERMAID__", () => mermaidRuntime())
    .replace("__MODEL__", () => safe);
}

const HERE = dirname(fileURLToPath(import.meta.url));

export function renderTree(treeDir: string): string {
  const template = readFileSync(join(HERE, "architecture.template.html"), "utf8");
  return render(template, buildModel(treeDir));
}

function main(argv: string[]): number {
  const outIdx = argv.indexOf("--out");
  const outArg = outIdx !== -1 ? argv[outIdx + 1] : undefined;
  const outValIdx = outIdx !== -1 ? outIdx + 1 : -1;
  // Drop --out AND its value before selecting the positional tree, or the destination path
  // gets picked up as treeDir (e.g. `--out /tmp/a.html` searched /tmp/a.html/README.md).
  const positional = argv.filter((a, i) =>
    a !== "--out" && i !== outValIdx && !a.startsWith("-"));
  const treeDir = positional[0] ?? "docs/architecture";
  const out = outArg ?? join(treeDir, "index.html");
  const html = renderTree(treeDir);
  writeFileSync(out, html);
  console.log(`architecture-html: ${out}`);
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
