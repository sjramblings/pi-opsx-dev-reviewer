# Tasks — add-architecture-html

> Sequenced after `add-architecture-writer` merges — it modifies that change's promoted
> `architecture-doc` and `arch-lint` specs. Zero new runtime dependencies.

## 1. Shared theme

- [x] 1.1 Extract the evolution-timeline design tokens into `tools/lib/theme.css` — the `:root`
      token set, fonts, light and dark palettes — with no behavioural change.
      files: `tools/lib/theme.css`
      probe: the token set matches the values currently in `evolution-timeline.template.html`; the file has both light and dark palettes.
      out-of-scope: changing any token value or the visual design.
      spec: `shared-theme`

- [x] 1.2 Make `evolution-timeline.template.html` inline the shared theme instead of its own
      copy, and confirm the rendered timeline is visually identical.
      files: `tools/evolution-timeline.template.html`, `tools/evolution-timeline.ts`
      probe: `bun tools/evolution-timeline.ts` renders; a visual check confirms parity with the pre-change output; no external references introduced.
      out-of-scope: any timeline feature change.
      spec: `shared-theme`

## 2. The markdown renderer

- [x] 2.1 Write a zero-dependency focused markdown renderer covering the constructs the
      architecture-writer emits: ATX headings, dash lists, pipe tables, inline code, links,
      emphasis. Test-driven against the actual generated tree.
      files: `tools/architecture-html.ts`, `tools/architecture-html.test.ts`
      probe: unit tests render each construct correctly; a table, a nested list, and a code span from the real `docs/architecture/` tree round-trip to expected HTML; no new dependency in package.json.
      out-of-scope: constructs the writer does not emit (images, blockquotes, HTML passthrough) until needed.
      spec: `architecture-doc`

## 3. The HTML template and render

- [x] 3.1 Add `tools/architecture.template.html` — masthead with provenance and quality-goal
      thesis, sticky section nav, stat tiles, styled HLD/LLD crosswalk, theme toggle — inlining
      the shared theme, with a single `__MODEL__` injection point.
      files: `tools/architecture.template.html`
      probe: the template inlines `tools/lib/theme.css`, has exactly one `__MODEL__` point, and references no external host.
      out-of-scope: interactivity beyond theme toggle and section navigation.
      spec: `architecture-doc`, `shared-theme`

- [x] 3.2 Complete `tools/architecture-html.ts` — read `docs/architecture/*.md`, build the
      section model, inject at `__MODEL__` (escape `</script`, fail loud if absent), write a
      deterministic self-contained `docs/architecture/index.html`.
      files: `tools/architecture-html.ts`
      probe: `bun tools/architecture-html.ts` writes `index.html`; two runs on an unchanged tree produce byte-identical output; opening it offline renders all twelve sections.
      out-of-scope: rendering any tree other than `docs/architecture/`.
      spec: `architecture-doc`

## 4. Gate and workflow

- [x] 4.1 Add the HTML-freshness check to `arch-lint`: re-render the markdown in memory and
      compare against the committed `index.html`; a mismatch or a missing render is a `FAIL`.
      Keep the three-state contract.
      files: `tools/arch-lint.ts`
      probe: a stale HTML fails and is named; a current HTML passes; a missing HTML with section files present fails; two runs on an unchanged current tree are stable.
      out-of-scope: gating the HTML for content — the markdown is the content gate.
      spec: `arch-lint`

- [x] 4.2 Add a `just architecture-html` recipe and a render step to the architecture-writer
      method so the HTML is produced in every generation run.
      files: `justfile.opsx`, `agents/architecture-writer.md`
      probe: `just architecture-html` renders; the agent method names the render step after the markdown; `just arch-lint` includes the freshness check in its output.
      out-of-scope: changing the markdown generation behaviour.
      spec: `architecture-doc`

## 5. Ship + dogfood

- [x] 5.1 Ship the new tool and asset in `install.sh`, render the real
      `docs/architecture/index.html`, and pass `just arch-lint` clean including freshness.
      files: `install.sh`, `docs/architecture/index.html`
      probe: `install.sh --here` copies `architecture-html.ts`, `architecture.template.html`, and `tools/lib/theme.css`; `just arch-lint` reports clean with the freshness check green; the rendered page opens offline and matches the markdown.
      out-of-scope: regenerating the markdown content — this renders the existing tree.
      spec: `architecture-doc`, `arch-lint`, `shared-theme`
