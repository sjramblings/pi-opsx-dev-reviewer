# arch-lint — delta

## ADDED Requirements

### Requirement: The gate requires a diagram in the diagram-bearing sections

`just arch-lint` SHALL fail when the context and scope, building block view, or deployment view
section has no Mermaid diagram, and SHALL warn when the runtime view or quality requirements
section has none. It SHALL NOT require a diagram in any other section.

#### Scenario: A missing required diagram fails

- **WHEN** the building block view section has no Mermaid fence
- **THEN** the gate exits non-zero and names the section

#### Scenario: A missing conventional diagram warns, not fails

- **WHEN** the runtime view section has no Mermaid fence but every required section has one
- **THEN** the gate reports a warning for the runtime view and does not fail on it

### Requirement: The gate validates Mermaid syntax

`just arch-lint` SHALL run a Mermaid validator over every Mermaid block in the tree and fail on
a parse error, so a broken diagram fails closed. When the validator is not installed the check
SHALL report `PARTIAL` and SHALL NOT report clean.

#### Scenario: An unparseable diagram fails

- **WHEN** a section contains a Mermaid block with invalid syntax
- **THEN** the gate exits non-zero and names the section and the parse error

#### Scenario: A missing validator degrades to PARTIAL

- **WHEN** no Mermaid validator is installed
- **THEN** the diagram-syntax check reports `PARTIAL` naming the skipped count and the gate does not report clean
