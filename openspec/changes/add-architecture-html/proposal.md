# Render the architecture tree as a self-contained HTML page

## Why

The architecture-writer produces a twelve-section arc42 markdown tree. Markdown is the right
source of truth — it is diffable, gate-checkable, and derived from the code — but it is not
what an engineering engagement hands to a stakeholder. The `add-evolution-timeline` change
proved that a self-contained, themed HTML page reads as a far more professional artifact from
the same underlying data, with zero external dependencies and a light/dark editorial theme.

This change gives the architecture-writer that same output: a self-contained
`docs/architecture/index.html` rendered from the markdown tree, sharing one theme with the
evolution timeline so the two read as one system.

## What Changes

- A new `tools/architecture-html.ts` reads `docs/architecture/*.md`, renders each section to
  HTML with a zero-dependency focused markdown renderer, and writes a self-contained
  `docs/architecture/index.html` through a single `__MODEL__` injection point.
- The evolution timeline's theme tokens are extracted to a shared asset that both templates
  inline at build time, so a theme change updates both outputs.
- Markdown stays the single source of truth and the `arch-lint` gate target. The HTML is a
  derived render — never hand-authored, never a second source.
- The render is mandatory: the architecture-writer produces the HTML after the markdown, and
  `arch-lint` gains a freshness check that fails when `index.html` is not a current render of
  the markdown tree. A stale HTML cannot ship.

## Capabilities

### New Capabilities

- `shared-theme`: one theme asset both the timeline and the architecture HTML inline, so they read as one system

### Modified Capabilities

- `architecture-doc`: the tree gains a mandatory self-contained HTML render derived from the markdown
- `arch-lint`: the gate gains an HTML-freshness check and keeps its three-state, never-false-clean contract

## Impact

New: `tools/architecture-html.ts` (+ test), `tools/lib/theme.css` (shared tokens),
`tools/architecture.template.html`, `docs/architecture/index.html` (generated).
Modified: `tools/arch-lint.ts` (freshness check), `justfile.opsx` (`architecture-html`
recipe), `agents/architecture-writer.md` (render step), `tools/evolution-timeline.template.html`
(inline the shared theme instead of its own copy), `install.sh` (ship the new tool + asset).

Zero new runtime dependencies (confirmed decision). Sequenced after `add-architecture-writer`
merges, since it modifies that change's promoted `architecture-doc` and `arch-lint` specs.
