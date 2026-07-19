# arch-lint Specification

## Purpose
TBD - created by archiving change add-architecture-writer. Update Purpose after archive.
## Requirements
### Requirement: The gate enforces stated cost

`just arch-lint` SHALL fail when a decision reference or a pattern claim in the architecture tree
carries no stated consequence. A document that names no cost SHALL NOT pass.

#### Scenario: A costless claim fails

- **WHEN** section 8 names a pattern with no consequence, or section 4 references a decision with no trade-off
- **THEN** the gate exits non-zero and names the file and the claim

#### Scenario: A claim with a stated consequence passes

- **WHEN** every pattern claim and decision reference states at least one consequence the system accepts
- **THEN** the gate reports the stated-cost check clean

### Requirement: The gate checks citations, identifiers, and section completeness

`just arch-lint` SHALL verify that every Well-Architected identifier resolves against the synced
corpus, every best practice recorded as met carries a `file:line` reference, every ADR referenced in
section 9 exists under `docs/decisions/`, and every arc42 section is present with either content or
a declared reason for non-applicability.

#### Scenario: A dangling ADR reference fails

- **WHEN** section 9 links an ADR number with no matching file under `docs/decisions/`
- **THEN** the gate exits non-zero and names the missing ADR

#### Scenario: A silently empty section fails

- **WHEN** a section file has neither content nor a declared reason for non-applicability
- **THEN** the gate exits non-zero and names the section

### Requirement: The gate audits the architecture description against the 42010 checklist

`just arch-lint` SHALL check that the tree identifies its stakeholders, their concerns, the views
presented, and the decisions with rationale. The kit SHALL NOT claim ISO 42010 conformance in any
generated document.

#### Scenario: A missing stakeholder or concern section fails the audit

- **WHEN** the tree presents views without identifying the stakeholders and concerns they frame
- **THEN** the gate exits non-zero and names what is absent

#### Scenario: A conformance claim is rejected

- **WHEN** a generated document asserts conformance to ISO 42010
- **THEN** the gate exits non-zero, because tailoring is not permitted for conformance claims and the kit tailors

### Requirement: The gate degrades gracefully and never reports a false clean

`just arch-lint` SHALL skip any check whose tool is not installed, SHALL report `PARTIAL` naming the
count of skipped checks, and SHALL report `clean` only when every check ran.

#### Scenario: A missing tool yields PARTIAL, not clean

- **WHEN** the corpus lookup tool is not installed
- **THEN** the recipe reports `PARTIAL` with the skipped count and does not report `clean`

#### Scenario: Nothing to check is reported as such

- **WHEN** `docs/architecture/` does not exist
- **THEN** the recipe reports that no architecture tree was found rather than reporting clean

### Requirement: Archive requires a current tree when the change is architecturally significant

`just archive-check <change>` SHALL require a refreshed architecture tree when the change diff
touched an architecturally significant path, and SHALL record the reason when it does not.

#### Scenario: A significant change without a refresh blocks archive

- **WHEN** a change touched infrastructure, a module boundary, an external integration, or added an ADR, and `docs/architecture/` was not refreshed
- **THEN** `just archive-check` exits non-zero and names the significant paths that triggered the requirement

#### Scenario: A non-significant change skips the refresh on the record

- **WHEN** a change touched no architecturally significant path
- **THEN** `just archive-check` passes and records that the architecture refresh was skipped and why

