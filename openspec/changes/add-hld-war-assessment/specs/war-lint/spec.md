# war-lint—delta

## ADDED Requirements

### Requirement: The gate enforces full pillar coverage

`just war-lint` SHALL fail when the Well-Architected review under `docs/hld/` omits any of the six
pillars—Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization,
Sustainability. A review missing a pillar SHALL NOT pass.

#### Scenario: A missing pillar fails

- **WHEN** the review has no section for one of the six pillars
- **THEN** the gate exits non-zero and names the missing pillar

#### Scenario: All six pillars present passes coverage

- **WHEN** every pillar has a section, including any marked with a declared no-material-finding reason
- **THEN** the gate reports the coverage check clean

### Requirement: The gate enforces a risk rating and recommendation on every finding

`just war-lint` SHALL fail when any finding lacks a risk rating of HIGH, MEDIUM, or LOW, or lacks a
recommendation, so the deliverable is actionable rather than descriptive.

#### Scenario: An unrated finding fails

- **WHEN** a finding carries no HIGH/MEDIUM/LOW rating
- **THEN** the gate exits non-zero and names the finding

#### Scenario: A finding with no recommendation fails

- **WHEN** a finding is rated but states no recommended action
- **THEN** the gate exits non-zero and names the finding

### Requirement: The gate grounds Well-Architected identifiers in the corpus

`just war-lint` SHALL verify that every Well-Architected best-practice identifier cited in the review
resolves against the synced corpus via the existing grounding tool, and SHALL fail when the corpus is
unavailable rather than passing ungrounded claims.

#### Scenario: An unresolvable identifier fails

- **WHEN** the review cites a best-practice identifier that does not resolve against the corpus
- **THEN** the gate exits non-zero and names the identifier

#### Scenario: A missing corpus fails the gate

- **WHEN** the synced corpus is unavailable when the gate runs
- **THEN** the gate exits non-zero with an explicit corpus-missing error rather than reporting clean

### Requirement: The gate reuses the existing grounding tool, not a parallel implementation

`just war-lint` SHALL resolve identifiers and risk levels through the existing `tools/waf-grounding.ts`
contract rather than reimplementing corpus lookup, so the `HLD` review and the arc42 quality section
ground claims the same way.

#### Scenario: Grounding goes through the shared tool

- **WHEN** the gate checks a Well-Architected identifier
- **THEN** it resolves it via `tools/waf-grounding.ts` rather than a separate corpus parser
