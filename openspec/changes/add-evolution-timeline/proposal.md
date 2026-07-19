# Generate an architecture-evolution timeline from OpenSpec

## Why

`openspec/changes/` is already an append-only log of architectural intent — each change
names capabilities, declares requirements, records task and archive state — but nothing
reads that log back as a picture of how the architecture grew. The history exists; the
view does not. An operator, reviewer, or stakeholder who wants "how did this system get
here" today reads ten folders by hand.

## What Changes

- A deterministic tool reads `openspec/changes/` (active + archive), `openspec/specs/`,
  and git history of a target repo and emits a self-contained interactive HTML timeline:
  a date-grouped spine of changes, per-change capability/requirement/scenario/task
  metrics, a cumulative-requirements chart, and a drawer exposing each change's real
  proposal rationale and every requirement with its WHEN/THEN scenarios.
- The page always renders from data alone; the hero thesis is a computed observation
  over the model (all-added → accretion; high archive ratio → landing; large open
  backlog → in flight), never invented.
- A new `evolution-narrator` subagent optionally sharpens that thesis: it reads the
  extracted model and writes a `thesis.json` the tool renders instead of the computed
  default. The narrator is the ONLY model in the loop and is never required — without it
  the page is complete.
- A `just evolution-timeline` recipe wires it, portable to every repo that installs the
  kit.

## Capabilities

### New Capabilities

- `evolution-timeline`: extract an architecture-evolution model from an OpenSpec repo and
  render it as a self-contained interactive HTML page, with an optional model-authored
  thesis that never gates the deterministic output.

### Modified Capabilities

## Impact

- New: `tools/evolution-timeline.ts`, `tools/evolution-timeline.template.html`,
  `tools/evolution-timeline.test.ts`, `agents/evolution-narrator.md`, one recipe in
  `justfile.opsx`.
- No new runtime dependencies (bun + node stdlib + git only). No production code touched.
- Read-only against the target repo; writes only the output HTML and, under narration,
  a `thesis.json`.
