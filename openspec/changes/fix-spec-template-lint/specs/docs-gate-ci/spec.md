# docs-gate-ci — delta

## ADDED Requirements

### Requirement: The markdownlint floor runs in CI

A CI workflow SHALL run the markdownlint floor (the settled `.markdownlint-cli2.jsonc`) and the
template guard on every push and pull request affecting markdown, and SHALL fail the build when
either does not report clean. This is the gate this change settled and cleared to zero; the
other `docs-lint` tools (Vale, cspell, lychee) are wired incrementally as their content is
cleaned, tracked as a follow-up.

#### Scenario: A lint regression fails the build

- **WHEN** a pull request introduces a markdown file that violates the settled floor
- **THEN** the workflow exits non-zero and names the file and rule

#### Scenario: A clean tree passes

- **WHEN** every markdown file passes the settled floor and the templates pass the guard
- **THEN** the workflow reports success

### Requirement: A template regression fails the build in CI

The CI workflow SHALL run `just check-templates`, so a shipped OpenSpec template that emits
gate-rejecting output fails the build rather than being discovered later.

#### Scenario: A regressed template fails CI

- **WHEN** a template is edited so its output no longer passes the settled floor
- **THEN** the workflow exits non-zero and names the template

### Requirement: The local gate keeps its three-state behaviour

`just docs-lint` SHALL keep the existing three-state behaviour so a missing tool does not block
work on a laptop, and SHALL NOT report clean when it checked nothing.

#### Scenario: A local run still degrades gracefully

- **WHEN** `just docs-lint` runs on a machine with no tools installed
- **THEN** it reports `PARTIAL` naming the skipped count and does not report clean, exactly as before

#### Scenario: An empty scan is not a clean scan

- **WHEN** the gate matches no markdown files
- **THEN** it reports that nothing was checked rather than reporting clean
