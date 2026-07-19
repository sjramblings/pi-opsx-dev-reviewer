# Require and render diagrams in the architecture tree

## Why

The architecture-writer emits prose and tables but no diagrams. A diagram-free architecture
description is weaker for it: arc42's own reference examples make three sections
diagram-load-bearing, and Gregor Hohpe's and Simon Brown's guidance both treat the context,
building-block, and deployment views as figures, not paragraphs. Today nothing requires them,
and the generated `index.html` renders a Mermaid fence as a grey code block rather than a
diagram.

Research settled the approach. Mermaid is the only diagrams-as-code format GitHub renders
natively in Markdown with no build step, which fits a Markdown-first agent. arc42 makes §3
(context), §5 (building block), and §7 (deployment) diagram-mandatory in practice, with §6
(runtime) and §10 (quality tree) conventional. Mermaid's `C4` and `mindmap` syntaxes are
officially experimental, so the required diagrams must rest on stable `flowchart` and
`sequenceDiagram` primitives.

## What Changes

- The architecture-writer emits a Mermaid diagram in every diagram-required section (§3, §5,
  §7), is expected to in §6 and §10, and does not in the prose/table sections (§2, §9, §11, §12).
  Required diagrams use stable Mermaid primitives; `C4`/`mindmap` are opt-in enhancements.
- `arch-lint` gains a `diagram-presence` check (a Mermaid fence is required in §3/§5/§7, warned
  in §6/§10) and a `diagram-syntax` check (every Mermaid block must parse, or the gate fails).
- The `index.html` renders Mermaid diagrams. A pinned copy of the Mermaid runtime is inlined so
  the page stays self-contained and deterministic — the freshness hash still holds because the
  pinned runtime is byte-stable.
- `architect-scope` path-gates the architecture-writer's shell writes, closing the Codex finding
  that its `bash` tool could write outside `docs/architecture/**` and bypass its scope.

## Capabilities

### New Capabilities

<!-- none; this change modifies existing capabilities -->

### Modified Capabilities

- `architecture-doc`: diagram-bearing sections require a Mermaid diagram, and the HTML renders it
- `arch-lint`: the gate requires and validates section diagrams
- `agent-path-scoping`: the architecture-writer's shell writes are path-gated

## Impact

Modified: `agents/architecture-writer.md` (diagram method + per-section guidance),
`openspec/schemas/dev-reviewer/templates/architecture.md` (per-section diagram scaffolding),
`tools/arch-lint.ts` (two new checks), `tools/architecture-html.ts` + `architecture.template.html`
(render Mermaid), `extensions/architect-scope/index.ts` (bash path-gate), `justfile.opsx`,
`install.sh`, `docs/architecture/**` (dogfood: add the diagrams).
New dev-dependency at generation/gate time only: a Mermaid syntax validator (`@probelabs/maid`
or `mmdc`); no new runtime dependency. A pinned `mermaid` runtime asset is vendored for the HTML.

Stacks on `add-architecture-writer`, `add-architecture-html`, and the open `add-evolution-timeline`
fix branch (which also touches `architect-scope` and `architecture.template.html`); sequence after
those merge.
