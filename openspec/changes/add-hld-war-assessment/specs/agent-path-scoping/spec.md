# agent-path-scoping—delta

## MODIFIED Requirements

### Requirement: architect-scope supports per-agent write path allowlists

The `architect-scope` extension SHALL resolve write permission from a per-agent path policy rather
than a single free-writer boolean. An agent with a scoped policy SHALL be allowed only the paths its
policy names, and SHALL NOT fall through to the design-artifact allowance. The `solution-architect`
write allowance SHALL additionally include `docs/hld/`—its High-Level Design tree—on top of the
design artifacts it already writes (`proposal.md`, `design.md`, `specs/**`, `docs/decisions/**`),
and SHALL NOT include `docs/architecture/**`, which stays exclusive to `architecture-writer`.

#### Scenario: The writer reaches its own tree

- **WHEN** the current agent is `architecture-writer` and the target path is under `docs/architecture/`
- **THEN** the extension allows the call

#### Scenario: The writer is blocked from decisions

- **WHEN** the current agent is `architecture-writer` and the target path is under `docs/decisions/`
- **THEN** the extension blocks the call with a reason directing the decision to the `solution-architect`

#### Scenario: The writer is blocked from production code

- **WHEN** the current agent is `architecture-writer` and the target path is production code or tests
- **THEN** the extension blocks the call

#### Scenario: The architect reaches its `HLD` tree

- **WHEN** the current agent is `solution-architect` and the target path is under `docs/hld/`
- **THEN** the extension allows the call

#### Scenario: The architect is still blocked from the as-built tree

- **WHEN** the current agent is `solution-architect` and the target path is under `docs/architecture/`
- **THEN** the extension blocks the call, because that tree is exclusive to `architecture-writer`

#### Scenario: The architect still writes design artifacts

- **WHEN** the current agent is `solution-architect` and the target path is `proposal.md`, `design.md`, `specs/**`, or `docs/decisions/**`
- **THEN** the extension allows the call exactly as before this change

#### Scenario: Other existing agent scopes are unchanged

- **WHEN** the current agent is `developer`, `tech-writer`, or unidentified
- **THEN** the extension resolves exactly as it did before this change
