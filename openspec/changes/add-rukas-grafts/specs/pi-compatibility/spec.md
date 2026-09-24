# pi-compatibility—delta

## ADDED Requirements

### Requirement: One canonical verified-against Pi version

`docs/pi-compatibility.md` SHALL contain exactly one line of the form
`Last verified against pi X.Y.Z (YYYY-MM-DD)`, naming the evidence for it.

#### Scenario: The canonical line parses

- **WHEN** the drift check reads `docs/pi-compatibility.md`
- **THEN** it extracts one version

### Requirement: Verified-against claims elsewhere must agree

A verified-against claim SHALL name the canonical version. This covers any tracked file outside
`openspec/` and test files that says something was verified or tested against, with,
or on a specific pi version.

#### Scenario: A disagreeing claim fails

- **WHEN** a file says `tested with pi 0.79.9` while the canonical line says 0.83.0
- **THEN** the drift check reports that file

#### Scenario: Dated history is not a claim

- **WHEN** a file says `run against pi 0.79.9 on 2026-07-08`
- **THEN** the drift check does not report it

### Requirement: The installed binary is compared, not gated

`just pi-compat` SHALL print the canonical version and the installed `pi --version`, and say
when they differ, without failing on the difference.

#### Scenario: Newer installed pi

- **WHEN** the installed pi is newer than the canonical line
- **THEN** the recipe prints a notice to re-run the live shakedown and exits 0
