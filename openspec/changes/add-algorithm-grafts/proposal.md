# Graft four Algorithm elements into the harness

## Why
The harness already re-built the Algorithm's skeleton (the OpenSpec change ~ ISA, spec
scenarios ~ ISCs, retro ~ LEARN). Four reasoning-structure elements were missing, and each
strengthens the self-improvement loop the harness is growing — without importing the
Algorithm's DA-specific ceremony.

## What Changes
- **Refutation format (self-improvement substrate):** every learning carries
  `conjectured → refuted_by → learned → criterion_now` (Deutsch hard-to-vary). Template,
  README, and `/opsx-retro` updated; the three existing learnings backfilled.
- **Reproduce-first gate:** a bug-fix task's first `probe:` must be a failing reproduction
  (red→green); the reviewer BLOCKs a fix with no repro. Wired into AGENTS.md, the reviewer
  prompt, and the schema `tasks` instruction.
- **Commitment-boundary advice:** new `/opsx-advise` prompt — a cross-family second opinion on
  the *approach* (not the spec, not the diff) before build, when stuck, or before done.
- **Meta-loop:** `/opsx-retro` writes a per-change reflection to `memory/reflections.jsonl`;
  `/opsx-compost` mines reflections + trust + goals + tool-events and proposes process/doctrine
  changes — propose-only, human sign-off, evidence-grounded, never self-applied.

## Capabilities
- **New Capabilities**: `algorithm-grafts`

## Impact
Modified: `learnings/_TEMPLATE.md` + `README` + the 3 `LRN-*.md`; `prompts/opsx-retro.md`,
`opsx-review.md`, `opsx-compost.md`; new `prompts/opsx-advise.md`; `templates/AGENTS.md`;
`openspec/schemas/dev-reviewer/schema.yaml`; `install.sh`; repo README + index.html. No new
executable code (no new tool), so no new test surface. Deliberately NOT imported: effort-tier
floors, thinking-capability floors, euphoric-surprise, the 12-section ISA — ceremony a code
harness does not need.
