# lint-clean-templates — delta

## ADDED Requirements

### Requirement: Every governing lint rule is explicitly decided

`.markdownlint-cli2.jsonc` SHALL name every markdownlint rule that fires against this repo, set
to true or false with a stated reason. No rule SHALL govern the repo solely by inheriting a
markdownlint default.

#### Scenario: A firing default is decided, not inherited

- **WHEN** a markdownlint rule produces an error against any file in the repo
- **THEN** that rule appears in `.markdownlint-cli2.jsonc` with an explicit value and a reason

#### Scenario: A rule set false records why

- **WHEN** a rule is set false rather than adopted
- **THEN** the config states the reason, so a reader sees a decision rather than a gap

### Requirement: Shipped templates emit output that passes the gate

Every template under `openspec/schemas/dev-reviewer/templates/` SHALL emit output that passes
`just docs-lint` while still passing `openspec validate --strict`. This includes a top-level
heading on the spec-delta template.

#### Scenario: The spec-delta template satisfies the chosen floor

- **WHEN** a spec delta is seeded from `templates/spec.md`
- **THEN** the generated file carries a top-level heading and passes markdownlint against the chosen floor

#### Scenario: The lint-clean form still validates

- **WHEN** a spec delta in the lint-clean form is validated
- **THEN** `openspec validate --strict` reports the change valid

#### Scenario: The learnings entry shape passes

- **WHEN** a `learnings/` entry is created in the documented shape
- **THEN** it passes the chosen floor rather than failing on its first heading level

### Requirement: A template that fails its own gate fails the build

A regression guard SHALL fail when a shipped template emits output that the repo's own docs gate
rejects.

#### Scenario: A regressed template is caught

- **WHEN** a template is edited so its emitted output no longer passes the chosen floor
- **THEN** the guard exits non-zero and names the template

#### Scenario: The guard scans every shipped template

- **WHEN** the guard runs
- **THEN** it reports which templates it checked, and SHALL NOT report clean when it checked nothing

### Requirement: The backlog is cleared without content change

The existing markdownlint errors SHALL be cleared by structural edits only. No prose, code, or
requirement text SHALL change as part of the backlog pass.

#### Scenario: The backlog pass is structural only

- **WHEN** the backlog pass is reviewed
- **THEN** the diff contains only blank lines and heading levels, and any content change is a defect

#### Scenario: Specs still validate after the pass

- **WHEN** the `openspec/` area has been cleared
- **THEN** `openspec validate --strict` passes for every change and spec in the repo
