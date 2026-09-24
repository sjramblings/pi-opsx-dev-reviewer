# verdict-ledger-fidelity—delta

## ADDED Requirements

### Requirement: The verdict is recorded verbatim from the session transcript

`tools/record-verdict.ts` SHALL obtain the reviewer verdict from the parent pi session transcript—the
`role: "toolResult"` entry whose `toolName` is `subagent`, reading its text from
`message.content[]`—and SHALL append that text byte-identically. It SHALL NOT accept verdict text
supplied as a command argument, so the recorded ledger cannot diverge from what the reviewer actually
returned.

#### Scenario: The recorded entry matches the reviewer output byte for byte

- **WHEN** the recorder appends the verdict for a task
- **THEN** the appended text is byte-identical to the reviewer subagent result text in the transcript

#### Scenario: The recorder selects the most recent reviewer result

- **WHEN** the transcript contains several `subagent` tool results, the last of which is the reviewer
  verdict for the current task
- **THEN** the recorder appends that last result and no earlier one

#### Scenario: A missing reviewer result fails without writing

- **WHEN** the transcript contains no `subagent` tool result carrying a verdict block
- **THEN** the recorder exits non-zero, names what it could not find, and leaves `review-log.md`
  unchanged

#### Scenario: A malformed transcript fails without writing

- **WHEN** the transcript contains an entry whose `content` is absent or not an array
- **THEN** the recorder exits non-zero and leaves `review-log.md` unchanged, rather than appending a
  partial or empty entry

### Requirement: The ledger is append-only and idempotent

The recorder SHALL only append to `review-log.md` and SHALL NOT rewrite, reorder, or delete existing
entries. It SHALL be idempotent keyed on the transcript entry `toolCallId`, so re-running it for the
same verdict does not duplicate the entry. Where a `toolCallId` is absent, the recorder SHALL treat
the entry as unidentifiable and refuse rather than risk a duplicate.

#### Scenario: A re-run does not duplicate the entry

- **WHEN** the recorder runs twice against the same transcript and change
- **THEN** the ledger contains exactly one entry for that `toolCallId` and the file is otherwise
  unchanged

#### Scenario: Prior entries are preserved exactly

- **WHEN** the recorder appends a new verdict to a ledger that already holds three entries
- **THEN** all three prior entries are byte-identical afterwards and the new entry is last

#### Scenario: An entry with no identifier is refused

- **WHEN** the selected transcript entry has no `toolCallId`
- **THEN** the recorder exits non-zero and appends nothing

### Requirement: The recorder writes the ledger the archive gate already reads

The recorded entry SHALL carry the task identifier and a `VERDICT:` line in the position
`just archive-check` greps for, so the existing archive gate and its attestation continue to pass
without modification.

#### Scenario: A recorded ledger satisfies the archive gate

- **WHEN** every implemented task has been recorded by the recorder
- **THEN** `just archive-check <change>` reports the review ledger present with a verdict count equal
  to the number of implemented tasks

#### Scenario: The task identifier is present on each entry

- **WHEN** a verdict entry is appended for task 1.2
- **THEN** the entry names task 1.2, so a reader can map every verdict to its task

#### Scenario: A tampered ledger still fails the attestation

- **WHEN** a recorded entry is edited by hand after the fact
- **THEN** `just archive-check` fails on the attestation mismatch exactly as it does today
