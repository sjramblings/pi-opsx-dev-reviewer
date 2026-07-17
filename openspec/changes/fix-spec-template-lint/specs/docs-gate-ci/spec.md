# docs-gate-ci — delta

## ADDED Requirements

### Requirement: The docs gate runs in CI

A CI workflow SHALL install the docs-lint tools and run `just docs-lint` on every push and pull
request affecting markdown, and SHALL fail the build when the gate does not report clean.

#### Scenario: A lint regression fails the build

- **WHEN** a pull request introduces a markdown file that violates the chosen floor
- **THEN** the workflow exits non-zero and names the file and rule

#### Scenario: A clean tree passes

- **WHEN** every markdown file passes the chosen floor and every tool ran
- **THEN** the workflow reports success

### Requirement: PARTIAL is a failure in CI

The CI workflow SHALL treat a `PARTIAL` result as a failure, because the workflow installs the
tools and a skip therefore means the gate broke. Local runs SHALL keep the existing three-state
behaviour so a missing tool does not block work on a laptop.

#### Scenario: A missing tool in CI stops the build

- **WHEN** a docs-lint tool fails to install and the recipe reports `PARTIAL`
- **THEN** the workflow exits non-zero rather than treating the skip as a pass

#### Scenario: A local run still degrades gracefully

- **WHEN** `just docs-lint` runs on a machine with no tools installed
- **THEN** it reports `PARTIAL` naming the skipped count and does not report clean, exactly as before

### Requirement: The gate reports what it checked

`just docs-lint` SHALL NOT report clean when it checked nothing, and the CI workflow SHALL surface
which tools ran.

#### Scenario: An empty scan is not a clean scan

- **WHEN** the gate matches no markdown files
- **THEN** it reports that nothing was checked rather than reporting clean
