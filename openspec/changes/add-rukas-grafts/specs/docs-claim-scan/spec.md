# docs-claim-scan—delta

## ADDED Requirements

### Requirement: Specific claims added to docs must be backed elsewhere

`just claim-scan` SHALL read the lines a diff adds to Markdown files outside `openspec/changes/`
and flag each version number or size-with-unit that appears in no other file, and each
backticked relative file path that does not exist.

#### Scenario: An invented size is flagged

- **WHEN** a doc adds `requires 64 GB RAM` and no other file contains `64 GB`
- **THEN** the scan exits non-zero naming the doc and the token

#### Scenario: A backed version passes

- **WHEN** a doc adds `pi 0.83.0` and another tracked file contains `0.83.0`
- **THEN** that token is not flagged

#### Scenario: A missing path is flagged

- **WHEN** a doc adds a backticked path `tools/nope.ts` that does not exist
- **THEN** the scan flags it

### Requirement: The tech-writer and reviewer can run the gates

The tech-writer instructions SHALL require a clean `just claim-scan` before returning, and the
reviewer's gated bash SHALL admit `just diff-gate` and `just claim-scan`.

#### Scenario: Reviewer allowlist

- **WHEN** the reviewer runs `just diff-gate --change add-foo`
- **THEN** `architect-scope` allows it
