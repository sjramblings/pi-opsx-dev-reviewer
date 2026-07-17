# Architecture description — pi-opsx-dev-reviewer

This is the stakeholder-grade architecture description for the kit, structured as an
arc42 section tree and derived from shipped repository evidence. Every structural claim
cites `file:line`. The tree is regenerated, not hand-maintained: it records decisions,
rationale, constraints, and quality evidence, and derives structural facts at generation
time so they do not drift from the code.

## Provenance

- Source commit: `55367f8`
- Generation date: 2026-07-18
- Well-Architected corpus tag: `generated-at:2026-05-20T23:55:19.943Z`
- Well-Architected corpus content hash: `sha256:9b9945353ab2f6d14565be4f959b81ee319a93e29d90259442baf3c4f5452bc9`

The corpus provenance is recorded because the repository ships Well-Architected tooling
(`tools/waf-grounding.ts`). The corpus is not used to make claims about this repository —
see section 10 for why AWS Well-Architected assessment is out of scope for a local tool.

## Section index

1. Introduction and Goals — `01-introduction-and-goals.md`
2. Constraints — `02-constraints.md`
3. Context and Scope — `03-context-and-scope.md`
4. Solution Strategy — `04-solution-strategy.md`
5. Building Block View — `05-building-block-view.md`
6. Runtime View — `06-runtime-view.md`
7. Deployment View — `07-deployment-view.md`
8. Crosscutting Concepts — `08-crosscutting-concepts.md`
9. Architecture Decisions — `09-architecture-decisions.md`
10. Quality Requirements — `10-quality-requirements.md`
11. Risks and Technical Debt — `11-risks-and-technical-debt.md`
12. Glossary — `12-glossary.md`

## HLD/LLD crosswalk

The arc42 tree is the source of truth. This table maps engagement deliverable names onto
the generated sections without restructuring them.

| arc42 section | High-level design heading | Low-level design heading |
| --- | --- | --- |
| 1. Introduction and Goals | Solution overview and objectives | Not applicable — goals are not a low-level artifact. |
| 2. Constraints | Design constraints and assumptions | Environment and toolchain constraints |
| 3. Context and Scope | System context and interfaces | External interface inventory |
| 4. Solution Strategy | Architecture approach | Not applicable — strategy is high-level only. |
| 5. Building Block View | Logical component architecture | Module and file-level design |
| 6. Runtime View | Key process flows | Sequence-level behaviour |
| 7. Deployment View | Deployment and topology | Install and configuration detail |
| 8. Crosscutting Concepts | Cross-cutting design concepts | Concept implementation detail |
| 9. Architecture Decisions | Decision log summary | ADR references |
| 10. Quality Requirements | Non-functional requirements | Quality scenarios and evidence |
| 11. Risks and Technical Debt | Risk register | Defect and debt detail |
| 12. Glossary | Glossary | Glossary |
