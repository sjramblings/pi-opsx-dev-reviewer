## ADDED Requirements

### Requirement: Guards persist every blocked action to a ledger
Each `tool_call` guard SHALL append a structured record of every action it blocks to
`memory/tool-events.jsonl`, and the logging SHALL be fail-open — a logging failure never
changes or breaks the guard decision.

#### Scenario: A blocked command is recorded
- **WHEN** `developer-guard` blocks a destructive bash command
- **THEN** a JSON line with guard, tool, reason, target, and agent is appended to `memory/tool-events.jsonl`, and the call is still blocked

#### Scenario: Logging cannot break the guard
- **WHEN** the ledger cannot be written (e.g. read-only filesystem)
- **THEN** the guard still returns its block decision unchanged

### Requirement: The blocked-action signal is assessed into candidate learnings
`just tool-events` SHALL mine the ledger into ranked candidate learnings grouped by guard and
tool, and SHALL optionally detect retry loops (an identical tool input repeated) in a pi session.

#### Scenario: Recurring blocked actions are surfaced and ranked
- **WHEN** the ledger contains several blocks from the same guard and tool
- **THEN** `just tool-events` reports that class with its count and sample targets, ranked by frequency

#### Scenario: A retry loop is flagged
- **WHEN** `--session <s.jsonl>` is given and a tool input repeats at least the threshold number of times
- **THEN** the assessment lists it as a retry loop

#### Scenario: No signal reports clean
- **WHEN** the ledger is empty and no session retries exist
- **THEN** the assessment reports "clean — nothing to distil"

### Requirement: The shared guard library is load-safe
`extensions/lib/tool-events.ts` SHALL be covered by the pi load-breaker guard.

#### Scenario: The lib is linted with the guards
- **WHEN** `just check-extensions` runs
- **THEN** it scans `extensions/lib/*.ts` and fails on a regex literal, backtick, or apostrophe there
