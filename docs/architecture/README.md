# Architecture description—pi-opsx-dev-reviewer

This stakeholder architecture description follows arc42 and is derived from shipped repository
artifacts. Structural and quality claims cite repository evidence as `file:line`; the Markdown tree
is the source of truth (`openspec/schemas/dev-reviewer/schema.yaml:80`).

## Provenance

- Source commit: `171dfafbf6639343aa509145a887864e4a4a1d00`
- Generation date: 2026-07-21
- Well-Architected corpus tag: `generated-at:2026-05-20T23:55:19.943Z`
- Well-Architected corpus content hash:
  `sha256:9b9945353ab2f6d14565be4f959b81ee319a93e29d90259442baf3c4f5452bc9`

The corpus provenance is recorded because the repository ships a corpus-grounding engine
(`tools/waf-grounding.ts:2`). It is not used to claim that this local tool satisfies AWS
Well-Architected best practices; section 10 defines that assessment boundary.

## Section index

1. [Introduction and Goals](01-introduction-and-goals.md)
2. [Constraints](02-constraints.md)
3. [Context and Scope](03-context-and-scope.md)
4. [Solution Strategy](04-solution-strategy.md)
5. [Building Block View](05-building-block-view.md)
6. [Runtime View](06-runtime-view.md)
7. [Deployment View](07-deployment-view.md)
8. [Crosscutting Concepts](08-crosscutting-concepts.md)
9. [Architecture Decisions](09-architecture-decisions.md)
10. [Quality Requirements](10-quality-requirements.md)
11. [Risks and Technical Debt](11-risks-and-technical-debt.md)
12. [Glossary](12-glossary.md)

## `HLD`/LLD crosswalk

The arc42 tree remains the source of truth. This table maps every section to conventional
engagement headings without changing that tree.

| arc42 section | High-level-design heading | Low-level-design heading |
| --- | --- | --- |
| 1. Introduction and Goals | Solution overview and objectives | Goal traceability |
| 2. Constraints | Design constraints and assumptions | Runtime and toolchain constraints |
| 3. Context and Scope | System context and interfaces | External interface inventory |
| 4. Solution Strategy | Architecture approach | Strategy-to-component allocation |
| 5. Building Block View | Logical component architecture | Component responsibilities and interfaces |
| 6. Runtime View | Key process flows | Runtime sequences and failure paths |
| 7. Deployment View | Deployment topology | Install and local execution detail |
| 8. Crosscutting Concepts | Cross-cutting design concepts | Concept implementation and consequences |
| 9. Architecture Decisions | Decision-log summary | ADR references |
| 10. Quality Requirements | Non-functional requirements | Quality scenarios, evidence, and trade-offs |
| 11. Risks and Technical Debt | Risk register | Debt and mitigation detail |
| 12. Glossary | Domain glossary | Domain and implementation vocabulary |
