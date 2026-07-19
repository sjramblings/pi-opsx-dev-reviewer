# Add a scoped learning-over-time loop

## Why

The harness reviews code but learns lossily. It already has a per-change verdict ledger
(`review-log.md`), a ratchet (`/opsx-retro`), and a flat rules file (`AGENTS.md`) — but
`AGENTS.md` is unscoped so it reaches every delegation regardless of relevance, archived
review-logs leave the active path so cross-change learning evaporates, prose rules are
advisory only, and rules carry no provenance or lifecycle. The harness needs a **scoped**
memory that hands the developer exactly the past learnings that apply to the files under
review — without building a parallel knowledge store that duplicates the surfaces above.

## What Changes

- Add a scoped `learnings/` store: markdown entries with typed, versioned frontmatter
  (`scope` glob, `status`, provenance), a template, a README stating the one-fact/one-home
  routing rule, and one seeded active learning.
- Add `tools/select-learnings.ts` — a deterministic, dependency-free retrieval engine
  (glob match, status filter, bounded stable ordering, selection trace) with a unit test.
- Add `tools/audit-learnings.ts` — provenance + schema integrity check.
- Add `just` recipes: `learnings-preview` (read-path), `check-learnings` (canary),
  `learnings-audit` (provenance).
- Wire `/opsx-retro` to write scoped learnings (draft, with provenance) and `/opsx-loop`
  to read them at BRIEF. AGENTS.md keeps only global unscoped invariants (no dual-write).
- **Deferred** (tracked, not in this change's first slice): a `learnings-inject` pi
  extension that surfaces relevant learnings at session_start; a `regression-guard` that
  BLOCKs re-detection of an active bug-class in scope; a `prune-learnings` recipe.

## Capabilities

- **New Capabilities**: `learning-loop`

## Impact

New: `learnings/`, `tools/select-learnings.ts`, `tools/select-learnings.test.ts`,
`tools/audit-learnings.ts`. Modified: `justfile` (3 recipes), `prompts/opsx-retro.md`,
`prompts/opsx-loop.md`. No change to the developer/reviewer delegation protocol. No new
dependency (node/bun built-ins only). No parallel `knowledge/` store.
