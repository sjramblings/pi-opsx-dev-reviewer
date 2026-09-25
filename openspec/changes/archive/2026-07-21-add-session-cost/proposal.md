# Add a pi session cost rollup

## Why

`pi --export` (the session viewer) renders a session to HTML but shows **no cost total**.
Initial inspection mistook the subagent tool's text content for its whole persisted shape. Real
parent-session `JSONL` establishes that current `@mjakl/pi-subagent` tool results persist each child
run's aggregate usage under `message.details.results[].usage`, even though the child itself runs
with `--no-session`. The existing rollup ignores that structured data, so the viewer and rollup
under-represent true session cost. A complete rollup makes the already-persisted spend visible and
feeds the budget guardrail the autonomy work needs.

## What Changes

- `tools/session-cost.ts` + `just session-cost <session.jsonl> [--html]`: sum main-agent cost
  from `message.usage.cost` and persisted subagent cost from
  `message.details.results[].usage`, attributed per model, with one accepted grand total and an
  explicit complete/incomplete coverage state and a closed, ordered reason-code taxonomy; retain
  top-level `subagentCost` as a lower-precedence, independently collected legacy fallback; reject
  aggregate-overflowing values atomically rather than emitting non-finite totals; report malformed,
  ambiguous, or absent usage rather than silently under-reporting; `--html` emits an injection-safe
  cost-summary fragment to sit beside the exported session HTML.
- Wire it into `install.sh --here` (tools copy), correct the stale `justfile.opsx` recipe description
  so it states that valid persisted parent tool-result usage is included, replace obsolete
  TUI-only persistence claims in
  `README.md` and `index.html`, refresh the runtime/building-block architecture text, and index the
  accepted accounting ADRs in `docs/architecture/09-architecture-decisions.md` before archive.

## Capabilities

- **New Capabilities**: `session-cost`

## Impact

New: `tools/session-cost.ts` (+ test) and accepted ADRs `docs/decisions/0003`–`0005`. Modified:
`justfile.opsx` (description only; recipe interface and behavior remain stable), `install.sh`,
`README.md`, `index.html`, the runtime/building-block architecture
pages, and `docs/architecture/09-architecture-decisions.md`. No new dependency and no
session-writing hook: current subagent tool-result details are the persistence boundary. The
architecture refresh SHALL index the accepted ADRs before archive. Explicitly out of scope:
child session retention, changing `@mjakl/pi-subagent`, backfilling old sessions, or making
`pi --export` render the fragment.
