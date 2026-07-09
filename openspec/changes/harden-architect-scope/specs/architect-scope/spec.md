## ADDED Requirements

### Requirement: architect-scope fails closed for unidentified agents
The `architect-scope` extension SHALL deny `write` and `edit` tool calls whenever the
current agent cannot be positively identified as an authorized writer, rather than
allowing them.

#### Scenario: Unidentified agent is blocked
- **WHEN** `PI_SUBAGENT_STACK` is unset, empty, or unparseable and a `write` or `edit` is attempted
- **THEN** the extension returns a block with a reason directing the work to the developer

#### Scenario: Architect writing a non-design path is blocked
- **WHEN** the current agent is `solution-architect` and the target path is not a design artifact
- **THEN** the extension blocks the call

#### Scenario: Architect writing a design artifact is allowed
- **WHEN** the current agent is `solution-architect` and the target path is `proposal.md`, `design.md`, under `specs/`, or under `docs/decisions/`
- **THEN** the extension allows the call

#### Scenario: Non-architect identified agents keep full tools
- **WHEN** the current agent is positively identified as an agent other than `solution-architect` (e.g. `developer`)
- **THEN** the extension does not restrict its writes
