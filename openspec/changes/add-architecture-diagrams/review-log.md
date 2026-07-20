# Review log — add-architecture-diagrams

Durable record of every reviewer verdict for this change. The developer appends each
verdict block verbatim before ticking the task. At archive time, `/opsx-retro` reads
this file and ratchets recurring finding classes into lint rules, `openspec/config.yaml`
rules, or `AGENTS.md` lines. This is what stops review findings from evaporating after a
single task.

---

<!-- Appended per task, newest last. -->

## Tasks 1.1-1.2 — Agent + template diagram guidance

VERDICT: PASS
EVIDENCE CHECK: Yes. agents/architecture-writer.md step 5a requires a Mermaid diagram in §3/§5/§7,
expects one in §6/§10, forbids one in §2/§9/§11/§12, mandates stable flowchart/sequenceDiagram
primitives, and warns about the -- edge-label trap. The schema template carries the matching
diagram-rule comment.

## Tasks 2.1-2.2 — Render Mermaid in the HTML

VERDICT: PASS
EVIDENCE CHECK: Yes. tools/lib/mermaid.min.js is a pinned vendored 11.4.1 build (sha256 in
mermaid.pin.json); architecture.template.html inlines it at __MERMAID__ with a themed init that
renders pre.mermaid and re-renders on theme toggle. The renderer emits ```mermaid fences as
pre.mermaid (2 unit tests). Verified: index.html renders the diagrams offline with 0 external
refs; a standalone render is visually clean; the real page shows 3 data-processed blocks, SVG
role markers, and 0 rendered error icons; two renders are byte-identical (freshness holds).

## Tasks 3.1-3.2 — Gate checks

VERDICT: PASS
EVIDENCE CHECK: Yes. arch-lint gains diagram-presence (FAIL on missing §3/§5/§7, WARN on §6/§10)
and diagram-syntax (validates every block via a PATH validator or bunx-fetched @probelabs/maid,
FAIL on parse error, PARTIAL when unreachable — never a false clean). Verified by running each:
a missing required diagram failed and named the section; an injected bad diagram failed with the
parse error; the syntax check caught a real bug in the first-draft §7 diagram (-- in an edge
label). arch-lint now clean including both checks.

## Task 4.1 — architect-scope bash path-gate

VERDICT: PASS
EVIDENCE CHECK: Yes. architect-scope now gates bash for scoped agents deny-by-default: a scoped
agent may run read-only shell plus its own render/gate commands (just arch-lint, just
architecture-html, bun tools/architecture-html.ts with fixed args); redirection, command
substitution, sed -i, cp outside scope, chained writes, and env injection are blocked. 9 bash
tests added (29 total pass); check-extensions clean (tokenizer-safe, no regex literals/backticks/
apostrophes); bun build clean. Task 4.2 (real-pi load verification) remains open — needs a live
pi session.

## Task 5.1 — Ship + dogfood

VERDICT: PASS
EVIDENCE CHECK: Yes. install.sh --here ships the pinned mermaid runtime + pin file; the syntax
validator needs no separate install (bunx maid fallback). This repo's own §3/§5/§7 carry a
Mermaid diagram; just arch-lint clean including diagram-presence and diagram-syntax; the rendered
page shows the diagrams. 88 tests 0 fail; openspec validate --all 16/16; markdownlint floor 0.
