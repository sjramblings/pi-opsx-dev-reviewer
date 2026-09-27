# fix-loop-cap—delta

## ADDED Requirements

### Requirement: record-verdict bounds BLOCK rounds per task

After appending a verdict, `record-verdict` SHALL count the `BLOCK` verdict entries recorded
for the current task. When that count reaches the cap (`OPSX_MAX_BLOCK_ROUNDS`, default 3), it
SHALL append one `PARKED:` entry for the task, report `parked`, and exit with status 3.

#### Scenario: The third BLOCK parks the task

- **WHEN** a task already has two `BLOCK` entries and a third `BLOCK` verdict is recorded
- **THEN** the ledger gains the verdict entry and then a `PARKED:` entry for that task
- **AND** the command exits with status 3

#### Scenario: A BLOCK under the cap continues

- **WHEN** a task's first `BLOCK` verdict is recorded
- **THEN** the command exits 0 and reports the round count as 1 of 3

#### Scenario: PARKED entries do not count as verdicts

- **WHEN** a ledger contains a `PARKED:` entry
- **THEN** no line of that entry begins with `VERDICT:`

#### Scenario: An invalid cap fails closed

- **WHEN** `OPSX_MAX_BLOCK_ROUNDS` is not a positive integer
- **THEN** the command exits non-zero before appending anything

### Requirement: The loop stops on a parked task

`/opsx-loop` SHALL stop dispatching and report the parked task to the operator when
`record-verdict` reports `parked`, instead of handing findings back to the developer.

#### Scenario: Loop prompt names the stop

- **WHEN** the operator reads `prompts/opsx-loop.md`
- **THEN** its BLOCK step says a `parked` result stops the loop for operator review
