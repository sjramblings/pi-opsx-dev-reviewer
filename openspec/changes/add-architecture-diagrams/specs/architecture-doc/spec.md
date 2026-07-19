# architecture-doc — delta

## ADDED Requirements

### Requirement: Diagram-bearing sections carry a Mermaid diagram

The architecture-writer SHALL include a Mermaid diagram in the context and scope section, the
building block view section, and the deployment view section. It SHALL include one in the
runtime view and quality requirements sections when a scenario or quality tree is present, and
SHALL NOT place a diagram in the constraints, architecture decisions, risks, or glossary
sections. Required diagrams SHALL use stable Mermaid primitives (`flowchart`, `sequenceDiagram`);
`C4` and `mindmap` syntaxes MAY be used but SHALL NOT be required.

#### Scenario: The mandatory sections carry a diagram

- **WHEN** the writer generates the tree
- **THEN** the context and scope, building block view, and deployment view sections each contain a fenced Mermaid block

#### Scenario: Prose sections carry no diagram

- **WHEN** the writer generates the constraints, architecture decisions, risks, or glossary section
- **THEN** the section contains no Mermaid block

#### Scenario: A required diagram uses a stable primitive

- **WHEN** the writer emits a required diagram in the context, building block, or deployment section
- **THEN** the diagram uses a `flowchart` or `sequenceDiagram` primitive rather than an experimental `C4` or `mindmap` syntax

### Requirement: The HTML renders the Mermaid diagrams

The generated `docs/architecture/index.html` SHALL render each Mermaid diagram as a diagram, not
as a code block, while remaining self-contained with no external request. The Mermaid runtime
SHALL be a pinned, vendored build so the generated output is deterministic and the freshness
check holds.

#### Scenario: A Mermaid block renders as a diagram

- **WHEN** a reader opens `index.html` offline
- **THEN** each section's Mermaid block is drawn as a diagram and no request is made to any external host

#### Scenario: The render stays deterministic

- **WHEN** the tree is rendered twice with no change
- **THEN** the two `index.html` outputs are byte-identical, so the freshness check does not flap
