# architect-grounding — delta

## ADDED Requirements

### Requirement: The architect reads the architecture baseline

The solution-architect SHALL read `docs/architecture/` when it exists, as the current
architecture baseline, before settling a design, and SHALL keep the design consistent with its
building block, deployment, and decision views or name where the change deliberately departs from
them.

#### Scenario: The baseline informs the design

- **WHEN** the architect settles a design in a repo that has a `docs/architecture/` tree
- **THEN** it reads that tree and either aligns the design with the documented views or names the departure in its report

#### Scenario: No baseline is not a blocker

- **WHEN** the repo has no `docs/architecture/` tree
- **THEN** the architect proceeds without it rather than failing

### Requirement: The architect treats the baseline as last-archived, not ground truth

The architect SHALL weight `docs/architecture/` as the last-archived state, which lags in-flight
changes, and SHALL treat a conflict between the baseline and the current code as a prompt to
verify rather than an automatic block.

#### Scenario: A baseline conflict is checked, not obeyed blindly

- **WHEN** the documented baseline conflicts with the current code the architect is designing against
- **THEN** the architect verifies the current state rather than deferring to the possibly-stale tree

### Requirement: The architect records the change's architecture impact

The solution-architect SHALL record an architecture-impact note in `design.md` naming which arc42
sections its change alters, so the architecture-writer knows what to refresh at archive. The note
SHALL appear in the architect report.

#### Scenario: The impact note names the altered sections

- **WHEN** the architect settles a change that alters the system structure
- **THEN** `design.md` names the arc42 sections affected and the architect report surfaces that note

#### Scenario: A change with no architectural impact says so

- **WHEN** the change does not alter any documented architecture view
- **THEN** the impact note states that explicitly rather than being omitted
