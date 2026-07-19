# Design — add-architecture-writer

## Context

The kit has five agents. `solution-architect` decides and owns `design.md` plus `docs/decisions/`.
`tech-writer` documents one change for a user, structured by Diátaxis, gated by `just docs-lint`.
Nothing describes the system as a whole to a stakeholder.

The research base for this design, verified against primary sources:

- **arc42** is the only candidate that is both a real heading structure and actively maintained.
  Its 12 sections are the skeleton.
- **C4** populates arc42 sections 3 and 5 by an official mapping published in the C4 FAQ. Both
  authors endorse the pairing. The Code level is excluded — Simon Brown's own guidance is "No,
  particularly for long-lived documentation because most IDEs can generate this level of detail
  on demand."
- **ISO/IEC/IEEE 42010:2022** cannot supply headings — it specifies no format or media. Clause 4
  states that tailoring is "neither required nor permitted" for conformance claims. It is used
  here as an audit checklist, never as a structure and never as a claim.
- **MADR 4.0.0** is the ADR format already in use at `docs/decisions/0001`.
- **HLD/LLD** has no standards body and no canonical template. It is house convention, and its
  detail layer is exactly what Brown says not to hand-maintain. It is served by a crosswalk table,
  not by the native structure.

## Goals / Non-Goals

**Goals:**

- Produce a stakeholder-grade architecture description derived from the repo, refreshed at archive.
- Make "names what it gives up" a gate rather than a style note.
- Make every Well-Architected claim traceable to a corpus ID and a repo line.
- Keep one owner per artifact.

**Non-Goals:**

- Authoring ADRs. The writer indexes them; `solution-architect` writes them.
- A C4 Code level, or any hand-maintained mirror of code structure.
- Claiming ISO 42010 conformance.
- Diagram rendering. Diagrams are referenced or fenced as text; image generation is out of scope.
- Changing `tech-writer` scope or its `docs-lint` gate.

## Decisions

**A new agent rather than extending `tech-writer`.** Three structural reasons. Diátaxis models four
modes and an architecture description is a fifth shape, so folding it in would break the writer's
own "one mode per page" rule. The scope differs: `tech-writer` is change-scoped, the architecture
artifact is repo-scoped. The schema declares one owner per artifact, and co-ownership would be the
first violation of that rule in the kit.

**Section tree, not a single file.** `docs/architecture/` holds `README.md` plus twelve numbered
section files. Rationale: a regenerated document produces readable per-section diffs, a reviewer can
gate one section, and a stale section is visible in `git log` per file. The cost is that handing the
tree to an engagement needs an assembly step; the index carries the crosswalk so a reader can
navigate without it, and a render recipe is deferred rather than built now.

**Refresh at archive, gated on significance.** Regenerating twelve files on every change is waste, so
`archive-check` requires the artifact only when the change diff touched an architecturally
significant path. This reuses the glob-scoping pattern already proven by `just learnings-preview`.
The skip is recorded, never silent.

**HIGH-risk best practices as the default scope.** 126 of 306 are HIGH. This matches the Well-
Architected Tool's own prioritisation, which orders the improvement plan with high-risk issues
first, and keeps the quality chapter readable. Full-sweep stays available by flag.

**`anthropic/claude-opus-4-8` for the writer.** Whole-repo synthesis is long-context work, and it
places the writer in a different model family from the `solution-architect` (gpt-5.5) whose design
it describes — the same reasoning as `docs/decisions/0001-cross-family-reviewer.md`. The existing
`reviewer` (gpt-5.4) then reviews the output, giving cross-family coverage in both directions.

**Decision debt over invented rationale.** When the writer finds an architecturally significant
decision in code with no matching ADR, it records the gap in section 11 rather than reconstructing
why. This applies Hohpe's test — a document is architecture only if it carries decisions and their
rationale — as a feedback loop into the harness instead of a silent fabrication.

## Risks / Trade-offs

- **The gate can be satisfied without being true.** A citation can point at the wrong line and a
  consequence can be a token sentence. Mitigation: the cross-family `reviewer` reads the artifact,
  and the gate checks form while the reviewer checks substance. The gate is a floor, not a proof.
- **`architect-scope` is fail-closed and tokenizer-fragile.** Editing it risks silently disabling
  every write guard, which is the exact failure the shakedown caught. Mitigation: `just
  check-extensions` runs in the same task, and `harness-selftest` halts a session where the
  enforcer did not load.
- **Corpus drift.** The mirror refreshes daily; a pinned tag can go stale. Mitigation: the
  provenance stamp records tag and content hash, so staleness is visible rather than assumed.
- **Section-tree fragmentation.** Twelve files can drift out of step with one another. Mitigation:
  the tree is regenerated as a unit and the provenance stamp is written once at the index.
- **Scope creep into engagement deliverables.** The crosswalk invites requests for branded output
  and assembly. Held out of this change deliberately.
