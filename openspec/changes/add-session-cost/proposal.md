# Add a pi session cost rollup

## Why

`pi --export` (the session viewer) renders a session to HTML but shows **no cost total**, and
inspection confirmed that subagents run `--no-session` so their spend is computed live in the
TUI (`aggregateUsage`) and **never written to the parent session** — the tool-result is plain
text. So the viewer under-represents true cost and there is no main-agent total at all. A
rollup makes session cost visible and feeds the budget guardrail the autonomy work needs.

## What Changes

- `tools/session-cost.ts` + `just session-cost <session.jsonl> [--html]`: sum the main-agent
  cost per model (from `message.usage.cost`) with a grand total; count subagent calls and
  report that their cost is NOT persisted (TUI-only), rather than silently under-reporting;
  forward-compatible with a future `subagentCost` annotation; `--html` emits a cost-summary
  fragment to sit beside the exported session HTML.
- Wire it into `install.sh --here` (tools copy) and document it in `index.html`.

## Capabilities

- **New Capabilities**: `session-cost`

## Impact

New: `tools/session-cost.ts` (+ test). Modified: `justfile.opsx`, `install.sh`, `index.html`.
No new dependency. Explicitly out of scope: persisting subagent cost into the session
(needs fork-mode sessions or a subagent-cost hook) — filed as the follow-up the tool surfaces.
