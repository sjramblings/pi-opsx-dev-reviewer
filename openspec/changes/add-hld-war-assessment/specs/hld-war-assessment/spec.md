# HLD-war-assessment—delta

## ADDED Requirements

### Requirement: The solution-architect produces a repo-level `HLD` deliverable

The `solution-architect` SHALL produce a High-Level Design under `docs/hld/` that states the system
context and drivers, the target architecture, and the key decisions with their trade-offs—an
evaluative, design-intent document distinct from the as-built arc42 tree. It is a repo/solution-level
artifact produced on demand, NOT a per-change gate.

#### Scenario: The `HLD` states design intent, not only as-built

- **WHEN** the architect produces the `HLD` for a repo
- **THEN** `docs/hld/` describes the target architecture and its drivers, including design intent, rather than restricting itself to what is already shipped

#### Scenario: An ordinary change does not trigger the assessment

- **WHEN** a routine change is applied through the normal lifecycle
- **THEN** the `HLD`/WAF deliverable is not required for that change to complete, because it is a repo-level on-demand artifact rather than a per-change gate

### Requirement: The `HLD` carries a full six-pillar Well-Architected review

The `HLD` SHALL include a Well-Architected review covering all six pillars—Operational Excellence,
Security, Reliability, Performance Efficiency, Cost Optimization, and Sustainability—and SHALL NOT
omit a pillar. Each pillar section states findings for that pillar.

#### Scenario: All six pillars are present

- **WHEN** the architect writes the Well-Architected review
- **THEN** all six pillars appear, each with its findings, and none is omitted

#### Scenario: A pillar with nothing material says so

- **WHEN** a pillar has no material finding for this system
- **THEN** the pillar section states that explicitly with a one-line reason rather than being dropped

### Requirement: Every finding is risk-rated and carries a recommendation

Each Well-Architected finding SHALL carry a risk rating of HIGH, MEDIUM, or LOW and a recommendation,
so the review is actionable rather than descriptive.

#### Scenario: A finding without a risk rating is rejected

- **WHEN** a finding is recorded with no HIGH/MEDIUM/LOW rating
- **THEN** the gate fails and the finding is not accepted

#### Scenario: A rated finding names its recommendation

- **WHEN** a finding is rated
- **THEN** it states the recommended action to address or accept the risk

### Requirement: Well-Architected claims are grounded in the synced corpus

Every Well-Architected best-practice identifier cited in the review SHALL resolve against the synced
corpus via the existing grounding tool, and the review SHALL fail loudly rather than fabricate a
claim when the corpus is unavailable.

#### Scenario: An unresolvable identifier fails

- **WHEN** the review cites a best-practice identifier that does not resolve against the corpus
- **THEN** the gate exits non-zero and names the identifier

#### Scenario: A missing corpus fails loudly

- **WHEN** the synced corpus is unavailable at generation time
- **THEN** the architect stops with an explicit corpus-missing error rather than emitting ungrounded claims

### Requirement: The `HLD` cross-links the as-built tree instead of re-deriving it

The `HLD` SHALL reference `docs/architecture/` for as-built structural facts rather than duplicating
them, so the two artifacts do not drift and each keeps its own truth-mode.

#### Scenario: As-built facts are linked, not copied

- **WHEN** the `HLD` needs an as-built structural fact that the arc42 tree already records
- **THEN** it links the arc42 section rather than transcribing the fact into the `HLD`
