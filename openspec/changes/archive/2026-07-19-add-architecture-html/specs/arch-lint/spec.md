# arch-lint — delta

## ADDED Requirements

### Requirement: The gate checks HTML freshness

`just arch-lint` SHALL fail when `docs/architecture/index.html` is absent or is not a current
render of the markdown tree. The check SHALL re-render the markdown in memory and compare it
against the committed HTML, reporting a mismatch as a `FAIL`.

#### Scenario: A stale HTML fails the gate

- **WHEN** a section markdown file changed but `index.html` was not re-rendered
- **THEN** the gate exits non-zero and names the HTML as stale

#### Scenario: A current HTML passes

- **WHEN** `index.html` matches a fresh render of the markdown tree
- **THEN** the freshness check reports clean

#### Scenario: A missing HTML fails when the tree exists

- **WHEN** `docs/architecture/` has section files but no `index.html`
- **THEN** the gate exits non-zero and names the missing render

### Requirement: The freshness render is deterministic

The render used by the freshness check SHALL be a deterministic function of the markdown tree,
carrying no wall-clock or unordered iteration, so a matching HTML never flaps to `FAIL`.

#### Scenario: Re-running the gate on an unchanged tree is stable

- **WHEN** `just arch-lint` runs twice against an unchanged tree with a current HTML
- **THEN** both runs report the freshness check clean
