# agent-path-scoping — delta

## ADDED Requirements

### Requirement: A scoped agent's shell writes are held to its path policy

The `architect-scope` extension SHALL apply a scoped agent's path policy to write-capable shell
commands, not only to `write` and `edit` tool calls. A shell command that writes outside the
agent's allowed prefixes SHALL be blocked; a read-only or in-scope shell command SHALL be
allowed. When a shell command cannot be parsed with confidence, it SHALL be blocked.

#### Scenario: The architecture-writer cannot write outside its scope via shell

- **WHEN** the current agent is `architecture-writer` and it runs a shell command that writes outside `docs/architecture/**` (for example `sed -i`, `cp`, or a redirection into a repo path)
- **THEN** the extension blocks the command

#### Scenario: The architecture-writer can still run its gate and render

- **WHEN** the current agent is `architecture-writer` and it runs a read-only or in-scope shell command such as `just arch-lint` or `just architecture-html`
- **THEN** the extension allows the command

#### Scenario: An unparseable shell command is blocked

- **WHEN** a scoped agent runs a shell command the guard cannot parse with confidence
- **THEN** the extension blocks it rather than allowing it

### Requirement: The bash gate stays loadable under the pi tokenizer

The extended `architect-scope` SHALL contain no regex literals, no backticks, and no apostrophes,
including in comments and strings, and SHALL keep every quote character in even count.

#### Scenario: The load-breaker guard stays clean

- **WHEN** `just check-extensions` runs after the change
- **THEN** it reports clean and scans the modified `architect-scope` file
