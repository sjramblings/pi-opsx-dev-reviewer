# Architecture artifact

Written by the `architecture-writer` subagent. Generate `docs/architecture/` as an
arc42 section tree from shipped repository evidence. Derive structural facts with
`file:line` citations; do not duplicate code, `IaC`, configuration, or proposal intent.
Index `ADR` records by link only; never create, edit, or restate files under
`docs/decisions/`.

<!-- Not-applicable rule: every generated section file remains present. If a section has
     no repository-derived content, write `Not applicable — <one-line reason>.` under
     its H1 instead of omitting the file or leaving placeholder text. -->

<!-- Diagram rule: a Mermaid diagram is REQUIRED in §3 Context and Scope (context diagram),
     §5 Building Block View (container/component), and §7 Deployment View (deployment diagram);
     EXPECTED in §6 Runtime View (sequenceDiagram) and §10 Quality Requirements (tree); and must
     NOT appear in §2, §9, §11, §12. Required diagrams use stable `flowchart`/`sequenceDiagram`
     primitives; `C4`/`mindmap` are experimental and optional only. `just arch-lint` fails on a
     missing required diagram and on any diagram that does not parse. -->

## Index: `docs/architecture/README.md`

### Provenance

- Source commit: <!-- commit SHA used to generate this tree -->
- Generation date: <!-- ISO-8601 date or timestamp -->
- Well-Architected corpus tag: <!-- pinned corpus tag used for claims -->
- Well-Architected corpus content hash: <!-- content hash for the pinned corpus -->

### Section index

<!-- List the twelve generated files in order. Each target file has exactly one H1. -->

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

### HLD/LLD crosswalk

<!-- Keep the arc42 tree as the source of truth. Use this table to map engagement
     deliverable names onto the generated sections without restructuring them. -->

| arc42 section | High-level design heading | Low-level design heading |
| --- | --- | --- |
| 1. Introduction and Goals | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 2. Constraints | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 3. Context and Scope | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 4. Solution Strategy | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 5. Building Block View | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 6. Runtime View | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 7. Deployment View | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 8. Crosscutting Concepts | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 9. Architecture Decisions | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 10. Quality Requirements | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 11. Risks and Technical Debt | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |
| 12. Glossary | <!-- HLD heading --> | <!-- LLD heading or Not applicable — reason. --> |

## 1. Introduction and Goals

<!-- File: docs/architecture/01-introduction-and-goals.md
     Generated H1: 1. Introduction and Goals
     Stakeholders, business goals, quality goals, and repository evidence for each claim. -->

## 2. Constraints

<!-- File: docs/architecture/02-constraints.md
     Generated H1: 2. Constraints
     Technical, organizational, regulatory, and operational constraints with evidence. -->

## 3. Context and Scope

<!-- File: docs/architecture/03-context-and-scope.md
     Generated H1: 3. Context and Scope
     System context, external actors and systems, interfaces, and scope boundaries. -->

## 4. Solution Strategy

<!-- File: docs/architecture/04-solution-strategy.md
     Generated H1: 4. Solution Strategy
     Key architectural approaches and rationale grounded in implemented artifacts. -->

## 5. Building Block View

<!-- File: docs/architecture/05-building-block-view.md
     Generated H1: 5. Building Block View
     C4 context, container, and component views only; cite source files for derived facts. -->

## 6. Runtime View

<!-- File: docs/architecture/06-runtime-view.md
     Generated H1: 6. Runtime View
     Important runtime scenarios, request flows, jobs, events, and failure handling. -->

## 7. Deployment View

<!-- File: docs/architecture/07-deployment-view.md
     Generated H1: 7. Deployment View
     Deployment topology, environments, infrastructure, configuration, and operations. -->

## 8. Crosscutting Concepts

<!-- File: docs/architecture/08-crosscutting-concepts.md
     Generated H1: 8. Crosscutting Concepts
     Cross-cutting patterns and concepts. Each named pattern needs catalog citation,
     instantiating file:line evidence, and at least one accepted consequence. -->

## 9. Architecture Decisions

<!-- File: docs/architecture/09-architecture-decisions.md
     Generated H1: 9. Architecture Decisions
     Index records from docs/decisions/ by number, title, status, and link. Do not
     restate decision content or invent rationale. -->

## 10. Quality Requirements

<!-- File: docs/architecture/10-quality-requirements.md
     Generated H1: 10. Quality Requirements
     Quality attributes, scenarios, Well-Architected best-practice IDs, risk levels,
     source URLs, and repository evidence for every met claim. -->

## 11. Risks and Technical Debt

<!-- File: docs/architecture/11-risks-and-technical-debt.md
     Generated H1: 11. Risks and Technical Debt
     Known risks, technical debt, decision debt for significant choices with no `ADR`,
     consequences, mitigations, and evidence. -->

## 12. Glossary

<!-- File: docs/architecture/12-glossary.md
     Generated H1: 12. Glossary
     Terms, acronyms, and domain language used by this architecture description. -->
