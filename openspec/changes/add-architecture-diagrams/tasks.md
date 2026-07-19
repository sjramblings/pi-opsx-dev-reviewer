# Tasks — add-architecture-diagrams

> Stacks on add-architecture-writer, add-architecture-html, and the add-evolution-timeline fix
> branch (shared files: architect-scope, architecture.template.html, arch-lint). Apply after
> those merge. Task 4 edits the tokenizer-fragile guard and runs alone.

## 1. The agent

- [ ] 1.1 Update `agents/architecture-writer.md`: a diagram method step and per-section guidance
      — require a Mermaid diagram in the context, building block, and deployment sections; expect
      one in runtime and quality; forbid one in constraints, decisions, risks, glossary; use
      stable `flowchart`/`sequenceDiagram` primitives, `C4`/`mindmap` opt-in only.
      files: `agents/architecture-writer.md`
      probe: the method names the required, expected, and forbidden sections and the stable-primitive rule.
      out-of-scope: changing the ADR boundary or the derive-do-not-duplicate rule.
      spec: `architecture-doc`

- [ ] 1.2 Add per-section diagram scaffolding to
      `openspec/schemas/dev-reviewer/templates/architecture.md`.
      files: `openspec/schemas/dev-reviewer/templates/architecture.md`
      probe: the template marks §3/§5/§7 as diagram-required and §2/§9/§11/§12 as diagram-free.
      out-of-scope: generating real diagram content.
      spec: `architecture-doc`

## 2. Render Mermaid in the HTML

- [ ] 2.1 Vendor a pinned Mermaid runtime build under `tools/lib/` and inline it in
      `architecture.template.html`; render `pre.mermaid` blocks on load, themed to match.
      files: `tools/lib/`, `tools/architecture.template.html`
      probe: `index.html` renders a Mermaid block as a diagram offline with no external request; the vendored build is a pinned version.
      out-of-scope: build-time SVG pre-rendering.
      spec: `architecture-doc`

- [ ] 2.2 Emit Mermaid fences from the markdown renderer in `architecture-html.ts` as
      `pre.mermaid` (not a `code` block), and keep the render deterministic (byte-identical on
      re-run) so the freshness check holds.
      files: `tools/architecture-html.ts`, `tools/architecture-html.test.ts`
      probe: a ```mermaid fence renders to `pre.mermaid`; two renders are byte-identical; `just arch-lint` freshness stays clean.
      out-of-scope: validating Mermaid syntax (task 3).
      spec: `architecture-doc`

## 3. Gate checks

- [ ] 3.1 Add `diagram-presence` to `arch-lint`: fail on a missing Mermaid block in §3/§5/§7,
      warn for §6/§10, ignore the rest.
      files: `tools/arch-lint.ts`
      probe: a tree missing the building-block diagram fails and names it; a tree missing only the runtime diagram warns and passes; a prose-section diagram is not required.
      out-of-scope: syntax validation.
      spec: `arch-lint`

- [ ] 3.2 Add `diagram-syntax` to `arch-lint`: run a Mermaid validator (`@probelabs/maid` or
      `mmdc`) over every block; fail on a parse error; `PARTIAL` when absent; never a false clean.
      files: `tools/arch-lint.ts`, `justfile.opsx`
      probe: an invalid Mermaid block fails and names the parse error; with no validator installed the check reports PARTIAL; a valid tree passes.
      out-of-scope: auto-fixing diagrams.
      spec: `arch-lint`

## 4. Bash path-gate (runs alone)

- [ ] 4.1 Extend `architect-scope` to apply a scoped agent's path policy to write-capable shell,
      reusing the `force-delegate` bash-parsing approach: block a shell write outside the agent's
      prefixes, allow read-only/in-scope shell, block on parse uncertainty. String methods only —
      no regex literals, backticks, or apostrophes.
      files: `extensions/architect-scope/index.ts`, `extensions/architect-scope/index.test.ts`
      probe: architecture-writer `sed -i` outside docs/architecture blocked; `just arch-lint` allowed; unparseable blocked; `just check-extensions` clean; `bun build` clean; unit tests cover each.
      out-of-scope: changing the write/edit path logic or any other agent's scope.
      spec: `agent-path-scoping`

- [ ] 4.2 Verify the guard still loads in a real pi session (bash gating must not break the
      loader).
      files: none
      probe: a real pi session starts with no harness-selftest halt banner and an architecture-writer out-of-scope shell write is blocked.
      out-of-scope: any code change; verification only.
      spec: `agent-path-scoping`

## 5. Ship + dogfood

- [ ] 5.1 Ship the Mermaid validator setup (a `docs-lint-setup`-style step) and the vendored
      runtime in `install.sh`; add the required diagrams to this repo's own `docs/architecture/`
      tree; pass `just arch-lint` clean including the two diagram checks.
      files: `install.sh`, `docs/architecture/**`, `justfile.opsx`
      probe: `install.sh --here` copies the vendored runtime; the repo's §3/§5/§7 carry a diagram; `just arch-lint` clean; the rendered page shows the diagrams (visual check).
      out-of-scope: rewriting the prose sections.
      spec: `architecture-doc`, `arch-lint`

## 6. Deferred

- [ ] 6.1 Offer a model-based (Structurizr DSL) opt-in path for teams needing many consistent C4
      views from one model, rendered in CI. Anti-rot upgrade beyond text-per-diagram.
      probe: a Structurizr model renders the context/container/component views consistently.
