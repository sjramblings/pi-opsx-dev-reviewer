# Review log—add-architecture-diagrams

Durable record of every reviewer verdict for this change. The developer appends each
verdict block verbatim before ticking the task. At archive time, `/opsx-retro` reads
this file and ratchets recurring finding classes into lint rules, `openspec/config.yaml`
rules, or `AGENTS.md` lines. This is what stops review findings from evaporating after a
single task.

---

<!-- Appended per task, newest last. -->

## Tasks 1.1-1.2—Agent + template diagram guidance

VERDICT: PASS
EVIDENCE CHECK: Yes. agents/architecture-writer.md step 5a requires a Mermaid diagram in §3/§5/§7,
expects one in §6/§10, forbids one in §2/§9/§11/§12, mandates stable flowchart/sequenceDiagram
primitives, and warns about the -- edge-label trap. The schema template carries the matching
diagram-rule comment.

## Tasks 2.1-2.2—Render Mermaid in the HTML

VERDICT: PASS
EVIDENCE CHECK: Yes. tools/lib/mermaid.min.js is a pinned vendored 11.4.1 build (sha256 in
mermaid.pin.json); architecture.template.html inlines it at __MERMAID__ with a themed init that
renders pre.mermaid and re-renders on theme toggle. The renderer emits ```mermaid fences as
pre.mermaid (2 unit tests). Verified: index.html renders the diagrams offline with 0 external
refs; a standalone render is visually clean; the real page shows 3 data-processed blocks, SVG
role markers, and 0 rendered error icons; two renders are byte-identical (freshness holds).

## Tasks 3.1-3.2—Gate checks

VERDICT: PASS
EVIDENCE CHECK: Yes. arch-lint gains diagram-presence (FAIL on missing §3/§5/§7, WARN on §6/§10)
<!-- cspell:disable-next-line -->
and diagram-syntax (validates every block via a PATH validator or bunx-fetched @probelabs/maid,
FAIL on parse error, PARTIAL when unreachable—never a false clean). Verified by running each:
a missing required diagram failed and named the section; an injected bad diagram failed with the
parse error; the syntax check caught a real bug in the first-draft §7 diagram (-- in an edge
label). arch-lint now clean including both checks.

## Task 4.1—architect-scope bash path-gate

VERDICT: PASS
EVIDENCE CHECK: Yes. architect-scope now gates bash for scoped agents deny-by-default: a scoped
agent may run read-only shell plus its own render/gate commands (just arch-lint, just
architecture-html, bun tools/architecture-html.ts with fixed args); redirection, command
substitution, sed -i, cp outside scope, chained writes, and env injection are blocked. 9 bash
tests added (29 total pass); check-extensions clean (tokenizer-safe, no regex literals/backticks/
apostrophes); bun build clean. Task 4.2 (real-pi load verification) remains open—needs a live
pi session.

## Task 5.1—Ship + dogfood

VERDICT: PASS
EVIDENCE CHECK: Yes. install.sh --here ships the pinned mermaid runtime + pin file; the syntax
validator needs no separate install (bunx maid fallback). This repo's own §3/§5/§7 carry a
Mermaid diagram; just arch-lint clean including diagram-presence and diagram-syntax; the rendered
page shows the diagrams. 88 tests 0 fail; openspec validate --all 16/16; markdownlint floor 0.

## Task 4.2—Real pi guard load verification

FINDINGS (most severe first):
- [P2][CONFIRMED] Selftest’s no-halt claim is not independently preserved—`extensions/harness-selftest/index.ts:28-34` writes its banner only to parent-process stderr, which is absent from the persisted JSONL. A selftest failure could still allow this session to continue. Re-run the exact `pi --mode json ...` probe while retaining its outer stderr artifact.

EVIDENCE CHECK: Partially. The persisted session records the exact spawned architecture-writer calls; `memory/tool-events.jsonl:729` independently proves the installed `architect-scope` runtime handler blocked the exact redirection, and the target is absent. `pwd .` was allowed. Source and `.pi/extensions` guards match. Only the no-harness-banner assertion relies on unpreserved outer stderr.

VERDICT: PASS

## Task 6.1—First review

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Task 6.1 is incompatible with the approved scope and has no implementable contract—`openspec/changes/add-architecture-diagrams/tasks.md:89-91` requires a Structurizr DSL CI-rendered opt-in, while `design.md:25-28` explicitly makes Structurizr a future opt-in “not built here.” No delta spec defines it; no Structurizr artifact exists; the sole workflow, `.github/workflows/docs-lint.yml:1-31`, does not render or publish C4 views.
  - scenario: marking 6.1 complete with no edits/archiving this change leaves teams with neither a DSL model nor CI rendering, so its required context/container/component probe cannot run.
  - fix: settle scope first. If truly deferred, remove the checkbox task or convert it to a non-checkbox follow-up/backlog note; do not tick it. If in scope now, amend design/specs to define: (1) DSL model/template location and ownership, (2) pinned renderer/tooling and execution boundary, (3) generated output format/location and ignore policy, (4) CI trigger, failure, and artifact semantics, and (5) normative scenarios proving one model produces the three C4 views consistently. Then implement and run that probe.

EVIDENCE CHECK: No—the no-edit result is consistent with the filesystem, but cannot prove completion of a task whose only required behavior is absent; the worktree also has unrelated OpenSpec artifact edits, so the claimed globally empty diff is not independently true.

## Task 6.1 scope-resolution re-review

VERDICT: PASS

FINDINGS (most severe first):
- [P2][CONFIRMED] “Review-log untouched” is contradicted by the actual diff—`openspec/changes/add-architecture-diagrams/review-log.md:51-80` was modified. The prior BLOCK remains preserved, so this does not invalidate the transparent removal of 6.1. Fix: describe or separate those unrelated review-log edits.

EVIDENCE CHECK: No—the strict validation was independently reproduced, and 6.1 is removed without being ticked; however, the asserted untouched review-log evidence is false. Mermaid remains the approved scope, and `design.md:26-27` names the planned Structurizr follow-up.
