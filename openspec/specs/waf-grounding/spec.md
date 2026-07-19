# waf-grounding Specification

## Purpose

TBD - created by archiving change add-architecture-writer. Update Purpose after archive.

## Requirements

### Requirement: Well-Architected claims resolve against a pinned corpus

Every Well-Architected best-practice identifier written into the architecture tree SHALL resolve
against the synced corpus from the `aws-well-architected-corpus` mirror. The writer SHALL NOT
invent, paraphrase, or infer a best-practice identifier or its text.

#### Scenario: An unknown identifier fails the gate

- **WHEN** the tree names a best-practice identifier that the corpus lookup cannot resolve
- **THEN** `just arch-lint` fails and names the unresolvable identifier

#### Scenario: A missing corpus halts rather than guesses

- **WHEN** the corpus is not synced
- **THEN** the writer reports that the corpus must be synced and emits no Well-Architected claims

### Requirement: A met best practice cites repo evidence

The writer SHALL NOT record a best practice as met without a concrete `file:line` reference into the
repo. Absence of evidence SHALL be reported as unevidenced rather than as met.

#### Scenario: A met claim carries evidence

- **WHEN** the writer records a best practice as met
- **THEN** the claim carries the identifier, its risk level, its source URL, and a `file:line` reference

#### Scenario: No evidence found is stated plainly

- **WHEN** a search for evidence of a best practice returns nothing
- **THEN** section 11 records it as unevidenced with its risk level, and section 10 does not record it as met

### Requirement: HIGH-risk best practices are the default scope

The writer SHALL assess HIGH-risk best practices by default, and SHALL support a full-sweep flag for
every risk level. Risk level SHALL be read from best-practice frontmatter.

#### Scenario: The default pass covers HIGH risk

- **WHEN** the writer runs with no scope flag
- **THEN** it assesses the HIGH-risk best practices and records the scope it used in section 10

#### Scenario: Risk is never taken from the lens

- **WHEN** the writer needs the risk level of a best practice
- **THEN** it reads the frontmatter risk field and does not derive risk from the custom lens risk rules

### Requirement: Corpus counts are derived and dated, never asserted

The writer SHALL derive any count of pillars, questions, or best practices from the synced corpus at
generation time and SHALL stamp it with the corpus tag. It SHALL NOT attribute a count to AWS.

#### Scenario: A count is stated with its provenance

- **WHEN** the tree states how many best practices were assessed
- **THEN** the figure is derived from the synced corpus and carries the corpus tag it came from
