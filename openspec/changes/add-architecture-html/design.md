# Design — add-architecture-html

## Context

`add-evolution-timeline` renders a self-contained HTML page from repo data: a pure-data model
is JSON-serialised into a single `__MODEL__` point inside a `<script type="application/json">`
tag, and client-side JS renders from it (`tools/evolution-timeline.ts:201`). The theme is a
set of CSS design tokens with light/dark support (`tools/evolution-timeline.template.html:6`).
It deliberately never runs a markdown parser, because its content is structured JSON.

The architecture tree is different: its twelve section files carry real prose, tables, and
lists. Rendering them to HTML needs a markdown-to-HTML step the evolution tool never needed.

## Goals / Non-Goals

**Goals:**

- A self-contained `docs/architecture/index.html` rendered from the markdown tree.
- One shared theme so the timeline and the architecture doc read as one system.
- Markdown stays the single source of truth and the gate target.
- The HTML is never stale — mandatory render, freshness-gated.

**Non-Goals:**

- Replacing markdown with HTML. Markdown is canonical; HTML is derived.
- A general-purpose markdown engine. The renderer covers only what the architecture-writer
  emits.
- A runtime dependency. The renderer is hand-rolled (confirmed decision).
- Diagram rendering or interactivity beyond theme toggle and section navigation.

## Decisions

**Markdown stays the source of truth; HTML is a derived supplement.** The architecture-writer
design rests on deriving from code and gating the content. A second hand-authored source would
drift and halve the gate. So the agent writes markdown (gated by `arch-lint`), then renders
HTML from it. One source, one gate.
Consequence: the render must be regenerated whenever the markdown changes, which the freshness
gate enforces.

**Zero-dependency focused renderer.** `tools/architecture-html.ts` renders exactly the
constructs the architecture-writer emits: ATX headings, dash lists, pipe tables, inline code,
links, and emphasis. Input is controlled, so the subset is safe.
Consequence: the repo stays dependency-free at the cost of owning ~150-250 lines of renderer
plus tests; a construct the writer does not emit today is not supported until added.

**Shared theme asset.** The design tokens move to `tools/lib/theme.css`; both templates inline
it at build time. One edit updates both outputs.
Consequence: the evolution timeline's template is touched to consume the shared asset — that
tool was archived, so its edit is a small, self-contained follow-up rather than free.

**Mandatory render, freshness-gated.** The architecture-writer always renders the HTML after
the markdown, and `arch-lint` fails when `index.html` differs from a fresh render of the
markdown — the same fail-closed logic as the archive refresh check.
Consequence: every architecture change pays the render step, and a hand-edit of the HTML is
rejected rather than silently kept, which is the intended trade-off.

## Injection and freshness mechanism

The render mirrors the evolution tool: serialise the section model to JSON, escape `</script`,
replace a single `__MODEL__` point, fail loud if it is missing. Freshness is a hash comparison
— `arch-lint` re-renders the markdown in memory and compares against the committed
`index.html`; a mismatch is a `FAIL`. The HTML is deterministic given the markdown, so the
comparison is stable.

## Risks / Trade-offs

- **Renderer gaps.** A markdown construct the writer starts emitting later would render wrong
  or be dropped. Mitigation: the renderer is test-driven against the actual generated tree, and
  the freshness gate surfaces a divergence as a diff.
- **Determinism of the render.** If the render embeds a timestamp or unordered map iteration,
  the freshness hash flaps. Mitigation: the model carries no wall-clock beyond the provenance
  date already in the markdown, and section order is fixed.
- **Touching an archived tool.** Extracting the shared theme edits `evolution-timeline`.
  Mitigation: the change is inlining an identical token set; a visual check of both outputs
  confirms parity.
- **HTML is not gated for content.** `arch-lint` checks the markdown, not the rendered HTML.
  Mitigation: that is correct by design — the HTML is a faithful render, so gating the source
  gates the output.
