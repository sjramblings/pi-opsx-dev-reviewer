# Design — add-evolution-timeline

## Context

The kit already treats `openspec/changes/` as the unit of work and ships tools that read
repo state deterministically (`arch-lint.ts`, `session-cost.ts`). This change adds a
reader that turns the change log into a picture. The one interesting design question is
where the boundary sits between deterministic code and a model, because the first cut of
this feature was authored interactively and its most valuable moment — noticing "49
requirements, zero retractions, most still in flight" — was a judgment call.

## Goals / Non-Goals

**Goals:**

- A repeatable, testable extraction that gives identical output for identical repo state.
- A page that is complete and honest with no model in the loop.
- A clean, optional seam for a model to sharpen the framing.
- Portability: works against any OpenSpec repo the kit installs into, not just this one.

**Non-Goals:**

- Not a live dashboard or server; a static file regenerated on demand.
- Not a linter or a gate; it reports, it does not block.
- Not an authored narrative generator; the model may only rewrite the hero thesis, and
  only over data it was given.

## Decisions

**Deterministic tool owns substance; the model owns only the hero thesis.** Parsing and
rendering are pure functions of repo state, so they live in TypeScript where they are
unit-tested and reproducible (Code-Before-Prompts). The model cannot change any count,
any requirement, or any scenario — only the headline and subhead, and only from the
extracted model. Rationale: the value of a history view is that you trust its numbers;
a model in the counting path forfeits that. Alternative rejected: an agent that authors
the whole page — non-reproducible, and it would let framing drift from the data.

**Zero-retraction is computed, not narrated.** Whether every requirement is ADDED is a
mechanical fact, so the deterministic thesis already states it. The narrator earns its
place only by choosing which true fact leads and phrasing it well, which is genuinely a
judgment that differs per repo and over time.

**The narration seam is a `thesis.json` handoff, not an inline shell-out.** The recipe
stays deterministic and harness-independent; the `evolution-narrator` subagent writes
`thesis.json`, and a second render consumes it. This avoids coupling the recipe to a
specific inference binary and keeps the model path strictly opt-in.

## Risks / Trade-offs

- **[Risk] git-date lookup is slow on large histories** → dates are read once per change
  folder, not per file; acceptable for the change-count scale OpenSpec repos reach.
- **[Risk] the template drifts from the extractor's model shape** → the extractor and
  template share one JSON contract; a shape change that the template does not read is
  caught by the smoke assertion in the test that the emitted page contains the stat row.
- **[Trade-off] a `thesis.json` handoff is one more step than an inline `--narrate`** →
  accepted for portability across harnesses; the deterministic recipe is the common path.

## Migration Plan

Additive. New files only; no existing recipe, tool, or agent changes behaviour.

## Open Questions

- Whether to later add per-capability lineage (which change first introduced each
  capability) as a second view — deferred until the timeline is in use.
