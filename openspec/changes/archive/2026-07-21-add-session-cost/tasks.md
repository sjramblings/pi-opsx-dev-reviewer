# Tasks—add-session-cost

> Tasks 1.1–4.1 record the initial implementation. Task 5.1 supersedes its incorrect
> assumption that current parent sessions do not persist subagent usage; evidence and rationale
> are recorded in `review-log.md` and `design.md`.

## 1. rollup tool

- [x] 1.1 Initial `tools/session-cost.ts` rollup—sum main cost per model + grand total,
      retain legacy `subagentCost` compatibility, emit a `--html` fragment, and surface subagent
      calls whose persisted details are not usable. Task 5.1 corrects its original source assumption.
      probe: `bun test tools/session-cost.test.ts` passes; run against a real session prints a per-model total.
- [x] 1.2 `just session-cost <session>` recipe.
      probe: `just session-cost <real-session.jsonl>` prints a grand total and exits 0.

## 2. Coverage honesty

- [x] 2.1 A session with subagent calls but no usable persisted usage reports the excluded
      cost rather than silently omitting it. Task 5.1 adds current native persisted-details support.
      probe: a fixture without usable subagent details reports that its cost is excluded.

## 3. Wiring + docs

- [x] 3.1 `install.sh --here` copies session-cost.ts; `index.html` documents the recipe.
      probe: `grep -q session-cost install.sh` and `grep -q session-cost index.html`.

## 4. Guard

- [x] 4.1 All tool tests pass, no load-breakers.
      probe: `bun test tools/` all pass; `just check-extensions` exits 0.

## 5. Complete persisted subagent accounting

- [x] 5.1 Consume already-persisted subagent usage from parent-session
      `subagent` tool-result `message.details.results[]`; validate and deduplicate eligible main and
      child records; apply native-over-legacy precedence; add accepted subagent cost to model rows,
      persisted subtotal, and grand total; expose deterministic complete/incomplete coverage in
      text and HTML; and HTML-escape every dynamic value.
      files: `tools/session-cost.ts`, `tools/session-cost.test.ts`, `justfile.opsx`
      probe: focused tests cover native single/parallel results, trimmed duplicate and whitespace-only
      ID handling, malformed main/container/child records with valid sibling isolation, model
      fallbacks, independently collected legacy fallback, native-plus-legacy ambiguity, atomic
      aggregate-overflow rejection, canonical coverage reason counts/order, and hostile HTML labels;
      all tool tests pass; a current real parent session includes its persisted subagent usage
      exactly once; `just session-cost` help no longer claims current subagent cost is TUI-only.
      out-of-scope: a writer hook, fork-mode persistence, child-session retention, modifying
      `@mjakl/pi-subagent`, changing `pi --export`, or backfilling session files.
      spec: `session-cost`

- [x] 5.2 Refresh shipped documentation after task 5.1: the `tech-writer` owns reader-facing
      `README.md` and `index.html` updates that replace obsolete TUI-only/not-persisted claims; the
      `architecture-writer` owns `docs/architecture/**`, including the session-cost runtime boundary
      and indexing accepted ADRs 0003–0005. Neither owner edits production code or the other's tree.
      files: `README.md`, `index.html`, `docs/architecture/**`
      probe: no shipped docs claim current subagent cost is TUI-only; architecture section 9 indexes
      ADRs 0003–0005 as accepted; architecture lint, docs lint, and strict `openspec` validation pass.
      out-of-scope: authoring additional ADRs or changing implementation behavior.
      spec: `session-cost`
