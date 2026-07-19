# architecture-doc — delta

## ADDED Requirements

### Requirement: The tree is rendered to a self-contained HTML page

The architecture-writer SHALL render `docs/architecture/index.html` from the markdown tree.
The page SHALL be self-contained — inline CSS and JavaScript, no external stylesheet, font, or
script — and SHALL present the twelve arc42 sections, the provenance stamp, and the HLD/LLD
crosswalk.

#### Scenario: The HTML is produced from the markdown

- **WHEN** the architecture-writer generates the tree
- **THEN** `docs/architecture/index.html` exists and renders the same twelve sections, provenance, and crosswalk that the markdown carries

#### Scenario: The page has no external references

- **WHEN** `docs/architecture/index.html` is opened offline
- **THEN** it renders fully with no request to any external host

### Requirement: The HTML is derived, never a second source

The HTML SHALL be a render of the markdown tree. The markdown SHALL remain the single source
of truth and the `arch-lint` gate target; the HTML SHALL NOT be hand-authored or carry content
absent from the markdown.

#### Scenario: HTML content traces to markdown

- **WHEN** a section appears in `index.html`
- **THEN** its content is present in the corresponding `docs/architecture/*.md` file

#### Scenario: A hand-edit of the HTML does not survive

- **WHEN** `index.html` is edited by hand and the tree is re-rendered
- **THEN** the render overwrites the hand-edit from the markdown source

### Requirement: The render is mandatory in a generation run

The architecture-writer SHALL render the HTML after writing the markdown, as part of the same
generation run, so the two are produced together.

#### Scenario: Generation produces both artifacts

- **WHEN** the architecture-writer completes a generation run
- **THEN** both the markdown tree and `index.html` are present and consistent
