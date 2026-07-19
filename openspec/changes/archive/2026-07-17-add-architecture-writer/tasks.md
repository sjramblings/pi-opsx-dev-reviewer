# Tasks — add-architecture-writer

> Work sequentially. Task 3 edits a fail-closed guard under the pi tokenizer constraints — it runs
> alone, and `just check-extensions` is part of its own probe, not a later task.

## 1. The agent

- [x] 1.1 Add `agents/architecture-writer.md` on `anthropic/claude-opus-4-8`, `thinking: high`,
      `tools: read,grep,find,ls,edit,write,bash`. Follow the five-part body skeleton every agent
      uses: identity, context-is-only-the-task, scope clamp naming `docs/architecture/` only,
      method, and a fenced `🏛️ ARCHITECTURE REPORT` block. State the ADR boundary explicitly:
      index them, never author them.
      files: `agents/architecture-writer.md`
      probe: the frontmatter parses and names the five fields; the body names `docs/architecture/` as its only writable path and `docs/decisions/` as forbidden.
      out-of-scope: any change to `tech-writer` or `solution-architect`.
      spec: `architecture-doc`

- [x] 1.2 Register the agent: add `architecture-writer` to the copy loop in `install.sh` and to the
      model sanity check alongside the existing anthropic-family entry.
      files: `install.sh`
      probe: `./install.sh` in a scratch `PI_CODING_AGENT_DIR` lands `agents/architecture-writer.md`; the model check names its model.
      out-of-scope: changing any existing agent's model.
      spec: `architecture-doc`

## 2. The schema artifact

- [x] 2.1 Add an `architecture` artifact to `openspec/schemas/dev-reviewer/schema.yaml` —
      `generates: docs/architecture/**`, `template: architecture.md`, `requires: [tasks]`, with an
      instruction declaring `architecture-writer` as owner and stating the derive-do-not-duplicate
      rule and the ADR boundary.
      files: `openspec/schemas/dev-reviewer/schema.yaml`
      probe: `openspec validate --strict` passes with the new artifact present.
      out-of-scope: changing the `docs` artifact owned by `tech-writer`.
      spec: `architecture-doc`

- [x] 2.2 Add `openspec/schemas/dev-reviewer/templates/architecture.md` — the arc42 skeleton as
      HTML-comment-scaffolded sections, matching the existing template style, including the
      not-applicable rule and the provenance stamp fields in the index.
      files: `openspec/schemas/dev-reviewer/templates/architecture.md`
      probe: the template names all twelve arc42 sections and carries no C4 code level.
      out-of-scope: generating any real content.
      spec: `architecture-doc`

## 3. Per-agent path scoping (runs alone)

- [x] 3.1 Replace the `FREE_WRITERS` boolean in `extensions/architect-scope/index.ts` with a
      per-agent path policy. `architecture-writer` is allowed `docs/architecture/**` only and does
      NOT fall through to the design-artifact allowance. `developer`, `tech-writer`,
      `solution-architect`, and unidentified agents resolve exactly as before. String methods only
      — no regex literals, no backticks, no apostrophes anywhere including comments.
      files: `extensions/architect-scope/index.ts`
      probe: unit tests cover writer-to-architecture allowed, writer-to-decisions blocked, writer-to-code blocked, and all four existing agent resolutions unchanged; `just check-extensions` clean; `bun build` clean.
      out-of-scope: widening or narrowing any existing agent's scope.
      spec: `agent-path-scoping`

- [ ] 3.2 Verify the enforcer still loads in a real pi session — `bun build` and unit tests pass
      while the pi load path is dead is the known failure mode.
      files: none
      probe: a real pi session starts with no `harness-selftest` halt banner, and a main-agent write is still blocked.
      out-of-scope: any code change; this is verification only.
      spec: `agent-path-scoping`

## 4. The gate

- [x] 4.1 Add `just arch-lint` to `justfile.opsx` following the `docs-lint` three-state pattern:
      stated-cost check, best-practice identifier resolution, evidence-for-met check, ADR existence
      check, section completeness with declared non-applicability, and the 42010 audit checklist.
      Graceful-skip per tool; `PARTIAL` names the skipped count; never a false clean; report
      not-found when `docs/architecture/` is absent.
      files: `justfile.opsx`
      probe: a fixture tree with a costless pattern claim fails and names it; a fixture with an unresolvable identifier fails and names it; a clean fixture reports clean; an absent tree reports not-found rather than clean.
      out-of-scope: changing `docs-lint`.
      spec: `arch-lint`

- [x] 4.2 Extend `just archive-check <change>` to require a refreshed tree when the change diff
      touched an architecturally significant path, reusing the glob-scoping approach already used by
      `learnings-preview`. Record the skip reason when not significant.
      files: `justfile.opsx`, `tools/` as needed
      probe: a change touching an extension requires the refresh and blocks without it; a docs-only change passes and records the skip reason.
      out-of-scope: changing the review-ledger or probe-attestation checks in `archive-check`.
      spec: `arch-lint`

## 5. Well-Architected grounding

- [x] 5.1 Wire corpus lookup through the `pi-skill-wellarchitected` tools — resolve identifiers,
      read risk from best-practice frontmatter, default to HIGH-risk scope with a full-sweep flag,
      and fail loudly when the corpus is not synced. Never read risk from the lens risk rules.
      files: `justfile.opsx`, `tools/` as needed
      probe: an unresolvable identifier exits non-zero and names it; an unsynced corpus reports sync-required rather than emitting claims; the HIGH-risk default assesses the HIGH set and records the scope.
      out-of-scope: vendoring, scraping, or modifying the corpus mirror.
      spec: `waf-grounding`

## 6. Docs and the decision

- [ ] 6.1 Update `README.md` and `index.html` for the new agent, the new artifact, and the new
      recipes — a stale entry doc is a BLOCK finding per `AGENTS.md`. Add the new vocabulary to
      `cspell.json`.
      files: `README.md`, `index.html`, `cspell.json`
      probe: `just docs-lint` clean; the README box diagram names six agents; `grep -q architecture-writer index.html`.
      out-of-scope: rewriting unrelated README sections.
      spec: `architecture-doc`

- [x] 6.2 Record the settled decision as `docs/decisions/0002-architecture-writer-agent.md` in MADR
      form, superseding nothing.
      files: `docs/decisions/0002-architecture-writer-agent.md`
      probe: the file carries status, date, context, considered options, decision outcome, and consequences tagged Good and Bad.
      out-of-scope: editing ADR 0001.
      spec: `architecture-doc`

## 7. Dogfood

- [x] 7.1 Generate `docs/architecture/` for this repo with the new agent and pass `just arch-lint`.
      The kit documenting itself is the first real test of the gate.
      files: `docs/architecture/**`
      probe: the tree exists with twelve sections plus an index, `just arch-lint` reports clean, section 9 indexes both ADRs, and section 11 names any decision debt found.
      out-of-scope: fixing whatever decision debt the pass surfaces — that is a separate change.
      spec: `architecture-doc`, `arch-lint`, `waf-grounding`

## 8. Deferred

- [ ] 8.1 A `just arch-render` recipe assembling the section tree into a single deliverable file.
      probe: the assembled file carries all twelve sections in order with the index crosswalk resolved.

- [ ] 8.2 Diagram generation for the context, container, and deployment views. The tree references
      or fences diagrams as text today.
      probe: a generated diagram renders and matches the building block view it claims to show.
