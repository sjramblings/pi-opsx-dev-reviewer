# agent-path-scoping Specification

## Purpose

TBD - created by archiving change add-architecture-writer. Update Purpose after archive.

## Requirements

### Requirement: architect-scope supports per-agent write path allowlists

The `architect-scope` extension SHALL resolve write permission from a per-agent path policy rather
than a single free-writer boolean. An agent with a scoped policy SHALL be allowed only the paths its
policy names, and SHALL NOT fall through to the design-artifact allowance.

#### Scenario: The writer reaches its own tree

- **WHEN** the current agent is `architecture-writer` and the target path is under `docs/architecture/`
- **THEN** the extension allows the call

#### Scenario: The writer is blocked from decisions

- **WHEN** the current agent is `architecture-writer` and the target path is under `docs/decisions/`
- **THEN** the extension blocks the call with a reason directing the decision to the `solution-architect`

#### Scenario: The writer is blocked from production code

- **WHEN** the current agent is `architecture-writer` and the target path is production code or tests
- **THEN** the extension blocks the call

#### Scenario: Existing agent scopes are unchanged

- **WHEN** the current agent is `developer`, `tech-writer`, `solution-architect`, or unidentified
- **THEN** the extension resolves exactly as it did before this change

### Requirement: Scoped agents fail closed

An agent whose policy cannot be resolved, or whose target path cannot be parsed, SHALL be blocked
rather than allowed.

#### Scenario: An unparseable target is blocked

- **WHEN** a scoped agent attempts a write whose target path cannot be read from the tool input
- **THEN** the extension blocks the call and logs it

#### Scenario: An unknown agent stays restricted

- **WHEN** `PI_SUBAGENT_STACK` is unset, empty, or unparseable
- **THEN** the extension restricts the call to design artifacts as before, rather than consulting a scoped policy

### Requirement: The extension stays loadable under the pi tokenizer

The modified `architect-scope` SHALL contain no regex literals, no backticks, and no apostrophes,
including inside comments and strings, and SHALL keep every quote character in even count.

#### Scenario: The load-breaker guard stays clean

- **WHEN** `just check-extensions` runs after the change
- **THEN** it reports clean and scans the modified `architect-scope` file

#### Scenario: The enforcer still loads in a real pi session

- **WHEN** a pi session starts with the modified extension installed
- **THEN** `harness-selftest` does not raise the unguarded-harness halt banner
