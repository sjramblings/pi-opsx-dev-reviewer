---
status: accepted
date: 2026-07-17
decision-makers: [maintainer]
---

# Generate architecture documentation with a separate agent rather than extending the tech-writer

## Context and Problem Statement

The kit documents changes for users through `tech-writer`, structured by Diátaxis. It has no way to
answer the stakeholder question — what is this system, what did it decide, and what does it give up.
That artifact is what an engineering engagement contracts for. Should the existing `tech-writer`
grow an architecture mode, or should a new agent own the artifact?

## Considered Options

- Extend `tech-writer` with an architecture mode and a fifth output shape.
- Add a separate `architecture-writer` agent owning its own artifact and gate.
- Extend `solution-architect`, which already owns design artifacts and ADRs.

## Decision Outcome

Chosen: a separate `architecture-writer` agent owning `docs/architecture/`.

Diátaxis models four modes, and `tech-writer` enforces one mode per page. An architecture
description is a fifth shape aimed at a different audience, so folding it into `tech-writer` would
break that agent's sharpest rule. Scope also differs: `tech-writer` is change-scoped, while an
architecture description is repo-scoped and refreshed at archive. The schema declares one owner per
artifact, and co-ownership would be the first violation of that rule in the kit.

`solution-architect` was rejected for the inverse reason. It decides and it authors ADRs. An agent
that both makes decisions and writes the document assessing them has no independent position from
which to record decision debt.

The writer therefore indexes ADRs and never authors one. When it finds an architecturally
significant decision in the code with no ADR, it records decision debt rather than reconstructing
the rationale, which turns Hohpe's test — a document is architecture only if it carries decisions
and their rationale — into a feedback loop instead of a silent fabrication.

The writer runs on `anthropic/claude-opus-4-8`: whole-repo synthesis is long-context work, and it
places the writer in a different model family from the `solution-architect` whose design it
describes, extending the reasoning in `0001-cross-family-reviewer.md`.

## Consequences

- Good: one owner per artifact survives, and `tech-writer` keeps its Diátaxis discipline intact.
- Good: the writer is structurally positioned to report decision debt, because it does not make the
  decisions it assesses.
- Good: cross-family coverage runs both ways — an Anthropic-family writer describing a GPT-family
  architect's design, reviewed by a GPT-family reviewer.
- Bad: a sixth agent adds registration surface — the copy loop, the model check, the path gate, and
  the README box diagram all grow another entry.
- Bad: the path gate must change from a free-writer boolean to a per-agent policy, and
  `architect-scope` is fail-closed and tokenizer-fragile, so the edit risks silently disabling every
  write guard. `just check-extensions` and the `harness-selftest` canary are the containment.
- Bad: two documentation gates now exist (`docs-lint` and `arch-lint`), and a contributor must know
  which artifact each governs.
