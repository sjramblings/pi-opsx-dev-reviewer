# Tasks — add-architect-grounding

> Behavioural change to the solution-architect agent plus a template section. No new gate.
> Stacks on the merged architecture-writer / architecture-doc work already on main.

## 1. The agent

- [x] 1.1 Add a method step to `agents/solution-architect.md`: before settling, read
      `docs/architecture/` when present as the last-archived baseline; align with its views or
      name the departure; treat a baseline-vs-code conflict as a prompt to verify, not a block.
      files: `agents/solution-architect.md`
      probe: the method names reading docs/architecture, the last-archived weighting, and the departure/verify rule.
      out-of-scope: changing the design-artifact write scope or the ADR method.
      spec: `architect-grounding`

- [x] 1.2 Add an architecture-impact line to the `🏛️ ARCHITECT REPORT` block naming the arc42
      sections the change alters (or "none").
      files: `agents/solution-architect.md`
      probe: the report block has an ARCHITECTURE IMPACT field.
      out-of-scope: the report fields already present.
      spec: `architect-grounding`

## 2. The template

- [x] 2.1 Add an "Architecture impact" section to
      `openspec/schemas/dev-reviewer/templates/design.md` — which arc42 sections this change
      alters, for the architecture-writer to read at archive. Keep the template lint-clean.
      files: `openspec/schemas/dev-reviewer/templates/design.md`
      probe: a design seeded from the template has an Architecture impact section; `just check-templates` clean.
      out-of-scope: the other design sections.
      spec: `architect-grounding`

## 3. Close the loop (writer side)

- [x] 3.1 Add a note to `agents/architecture-writer.md`: at generation, read the change's
      `design.md` Architecture impact section (when present) to target which sections need the
      most refresh — without treating it as the only source (the writer still derives from code).
      files: `agents/architecture-writer.md`
      probe: the writer method references the design.md Architecture impact as a refresh hint, not the sole source.
      out-of-scope: changing the derive-from-code rule or the diagram requirements.
      spec: `architect-grounding`

## 4. Verify

- [x] 4.1 Confirm the shipped agents still resolve and the docs stay clean.
      files: none
      probe: `just check-templates` clean; `bunx markdownlint-cli2` clean on the changed files; `openspec validate --all --strict` passes.
      out-of-scope: any code change; verification only.
      spec: `architect-grounding`
