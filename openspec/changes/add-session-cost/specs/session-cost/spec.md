## ADDED Requirements

### Requirement: A session's main-agent cost rolls up per model with a grand total
The harness SHALL sum a pi session's per-message cost by model and report a grand total,
which `pi --export` does not provide.

#### Scenario: Costs sum per model and overall
- **WHEN** `just session-cost <session.jsonl>` runs on a session with messages across two models
- **THEN** it prints a per-model breakdown (calls, tokens, cost) and a grand total equal to the sum of every `message.usage.cost.total`

#### Scenario: Malformed or blank lines are tolerated
- **WHEN** the session file contains blank or non-JSON lines
- **THEN** the rollup skips them and still totals the valid records

### Requirement: Subagent cost coverage is reported, never silently omitted
Because subagents run `--no-session`, their cost is not in the session; the rollup SHALL count
subagent calls and state that their cost is not included, rather than under-reporting silently.

#### Scenario: Subagent calls are surfaced as not-persisted
- **WHEN** a session contains one or more subagent tool calls with no persisted cost
- **THEN** the output states the number of subagent calls and that the grand total is main-agent only

#### Scenario: A persisted subagent-cost annotation is included when present
- **WHEN** a record carries a `subagentCost` object (a future persistence hook)
- **THEN** the rollup adds it and reports the persisted subagent cost

### Requirement: The rollup can render a viewer fragment
The tool SHALL emit an HTML cost-summary fragment on request, to sit beside the exported
session HTML.

#### Scenario: HTML output on demand
- **WHEN** `just session-cost <session.jsonl> --html` runs
- **THEN** it emits a self-contained HTML table of the per-model costs and grand total
