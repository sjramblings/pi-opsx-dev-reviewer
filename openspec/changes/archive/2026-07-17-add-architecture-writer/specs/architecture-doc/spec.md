# architecture-doc — delta

## ADDED Requirements

### Requirement: The architecture artifact is an arc42 section tree

The `architecture-writer` subagent SHALL produce `docs/architecture/` as an index file plus twelve
numbered section files named for the arc42 sections: introduction and goals, constraints, context
and scope, solution strategy, building block view, runtime view, deployment view, crosscutting
concepts, architecture decisions, quality requirements, risks and technical debt, glossary.

#### Scenario: The tree is generated with every section addressed

- **WHEN** the writer generates the artifact for a repo
- **THEN** `docs/architecture/README.md` and twelve numbered section files exist, each with exactly one H1

#### Scenario: An inapplicable section is declared, not dropped

- **WHEN** a section has no content for this repo
- **THEN** the section file states "Not applicable" with a one-line reason rather than being omitted or left empty

#### Scenario: No code level is emitted

- **WHEN** the writer describes the building block view
- **THEN** it stops at the container and component levels and emits no class-level or code-level section

### Requirement: The document records only what the code cannot state

The writer SHALL document decisions, rationale, constraints, and quality evidence, and SHALL derive
structural facts from the repo at generation time rather than transcribing them into prose that
would drift.

#### Scenario: A claim about the system cites its source

- **WHEN** the writer states a structural fact about the system
- **THEN** the statement carries a `file:line` citation into the repo

#### Scenario: Intent is not documented as fact

- **WHEN** `proposal.md` describes behaviour that the shipped code does not implement
- **THEN** the writer documents the code and does not document the proposal's intent

### Requirement: The writer indexes architecture decisions and never authors them

Section 9 SHALL be an index of the ADRs under `docs/decisions/`, linking each by number and title.
The `architecture-writer` SHALL NOT create or edit any file under `docs/decisions/`.

#### Scenario: Existing ADRs are indexed

- **WHEN** `docs/decisions/` holds accepted ADRs
- **THEN** section 9 lists each by number, title, and status, and links to the file rather than restating it

#### Scenario: An undocumented decision becomes decision debt

- **WHEN** the writer finds an architecturally significant decision in the code with no matching ADR
- **THEN** it records the gap in section 11 as decision debt and does not reconstruct the rationale

### Requirement: Every pattern claim names its catalogue and its cost

A named architectural pattern in section 8 SHALL carry the catalogue citation, the place it is
instantiated in the repo, and at least one consequence the system accepts by using it.

#### Scenario: A pattern claim is complete

- **WHEN** the writer states that a pattern is in use
- **THEN** the claim names the pattern, cites a catalogue, cites the instantiating `file:line`, and states a consequence

#### Scenario: A name-dropped pattern is rejected

- **WHEN** a pattern is named with no consequence stated
- **THEN** `just arch-lint` fails and the claim is not emitted

### Requirement: The index carries provenance and an HLD/LLD crosswalk

`docs/architecture/README.md` SHALL record the commit the tree was generated from, the generation
date, and the Well-Architected corpus tag and content hash used, and SHALL map the arc42 sections
onto high-level and low-level design headings for engagements that contract for those names.

#### Scenario: Provenance makes staleness visible

- **WHEN** a reader opens the index
- **THEN** it names the source commit, the generation date, and the corpus tag and content hash

#### Scenario: The crosswalk maps sections to engagement headings

- **WHEN** a reader needs a high-level or low-level design deliverable
- **THEN** the index maps each arc42 section onto the corresponding heading without restructuring the tree
