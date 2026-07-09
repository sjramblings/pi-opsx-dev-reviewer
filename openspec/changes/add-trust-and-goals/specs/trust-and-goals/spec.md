## ADDED Requirements

### Requirement: Autonomy graduates per skill from measured pass rates
The harness SHALL maintain a per-skill trust ledger that tallies pass/fail results and
derives a tier: `auto` at 20+ runs and 95%+ pass, `watch` under 10 runs or under 90% pass,
and `queue` otherwise.

#### Scenario: A skill reaches auto after a clean record
- **WHEN** a skill has 20 logged runs all passing
- **THEN** `bun tools/trust.ts tier <skill>` reports `auto`

#### Scenario: A dip below 90% demotes and alerts
- **WHEN** an established skill (10+ runs) drops below 90% pass rate on a new fail
- **THEN** the tier becomes `watch` and an ALERT line is written to stderr

#### Scenario: A new skill starts at watch
- **WHEN** a skill has fewer than 10 runs
- **THEN** its tier is `watch` regardless of pass rate

### Requirement: Finished work becomes a re-verified standing goal
Every standing goal SHALL carry a shell `predicate:`; a runner SHALL execute each predicate,
flip the goal file between `satisfied` and `VIOLATED`, append a ledger row, and exit
non-zero when any goal regresses.

#### Scenario: A satisfied predicate stays satisfied and stamps the date
- **WHEN** `just goals` runs a goal whose predicate exits 0
- **THEN** the file keeps `status: satisfied`, its `last-pass` is set to today, and a PASS row is appended to the ledger

#### Scenario: A failing predicate is flagged VIOLATED and fails the run
- **WHEN** a goal predicate exits non-zero
- **THEN** the file is set to `status: VIOLATED`, a FAIL row is appended, and the runner exits non-zero naming the goal

#### Scenario: Retired goals and the template are skipped
- **WHEN** a goal file is `status: retired` or is `_TEMPLATE.md`
- **THEN** the runner does not execute it

### Requirement: A weekly compost prompt ratchets failures across changes
The harness SHALL provide a `/opsx-compost` prompt that reads the week's failure signals and
proposes at most three laws, propose-only, respecting the one-fact/one-home routing rule.

#### Scenario: Compost proposes bounded, sign-off-gated laws
- **WHEN** `/opsx-compost` runs on a week with recurring failures
- **THEN** it proposes at most three laws (CLAUDE.md/AGENTS.md, a scoped learnings entry, or a standing goal) tied to quoted incidents, and applies nothing without human sign-off

### Requirement: Runtime ledgers are not committed
The trust and goal ledgers SHALL be treated as runtime state, not source.

#### Scenario: memory is gitignored
- **WHEN** the ledgers are written under `memory/`
- **THEN** `memory/` is ignored by git so the ledgers are never committed
