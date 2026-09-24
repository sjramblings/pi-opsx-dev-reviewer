# Design—add-HLD-war-assessment

## Context

The kit documents architecture only as-built: `architecture-writer` derives a descriptive arc42 tree
from shipped code and refuses design intent by contract ("document what IS ... not what the proposal
hoped would exist"), and `arch-lint` grounds Well-Architected identifiers as evidence for existing
quality claims. A no evaluative, stakeholder-grade High-Level Design—target architecture plus
a pillar-by-pillar Well-Architected assessment with risk-rated findings and recommendations—which is
the deliverable an engagement expects.

The `solution-architect` already owns design intent (it settles `proposal.md`, `design.md`, `specs/**`,
`docs/decisions/**` and never touches production code). An evaluative `HLD` is therefore native to its
role. The `waf-grounding.ts` tool already resolves `OPS01-BP01`-style identifiers against the synced
corpus and already speaks HIGH/MEDIUM/LOW risk levels, so the grounding machinery exists.

## Goals / Non-Goals

**Goals:**

- A repo-level `HLD` under `docs/hld/`: context and drivers, target architecture, key decisions and
  trade-offs, and a full six-pillar Well-Architected review with risk-rated, recommended findings.
- Every WAF claim grounded in the synced corpus; a `war-lint` gate that fails loudly on incomplete
  coverage, unrated findings, or ungrounded identifiers.
- Keep `architecture-writer`'s as-built tree and its truth-mode untouched; cross-link it, do not
  duplicate it.

**Non-Goals:**

- A per-change WAF audit. The deliverable is repo/solution-level and on demand—an ordinary change
  never drags a six-pillar assessment.
- A new agent. The `solution-architect` is extended, not replaced.
- Writing or editing ADRs (`docs/decisions/**` stays the architect's existing design-artifact scope;
  the `HLD` links decisions, it does not restate them).
- Any change to the as-built arc42 tree or `arch-lint`.

## Decisions

- **D1—Owner is the solution-architect, extended, not a new agent (operator decision).** The `HLD` is
  evaluative/design-intent, which the architect already produces; giving it the `HLD` mode reuses the
  design-owner role. *Alternative rejected:* bolt `HLD` onto `architecture-writer`—its contract is to
  refuse intent, so an evaluative `HLD` there would corrupt the property that makes the as-built tree
  trustworthy.

- **D2—repo-level, on demand, not a per-change gate (operator decision).** A full WAR-style review is
  a solution-level assessment; running it per change would drag a six-pillar audit onto trivial work.
  It is produced on demand like the arc42 tree. *Alternative rejected:* a per-change required artifact—
  wrong altitude and prohibitively heavy.

- **D3—New home `docs/hld/`, with `architect-scope` extended for the architect only.** `docs/architecture/**`
  is exclusive to `architecture-writer` (the guard actively blocks others), so the `HLD` needs its own
  prefix. `architect-scope` adds `docs/hld/` to the solution-architect policy and nothing else—no
  other agent is loosened, and the architect still cannot write `docs/architecture/**`. *Alternative
  rejected:* put the `HLD` under `docs/architecture/`—a direct collision with the writer's monopoly.

- **D4—Reuse `tools/waf-grounding.ts`; do not reimplement corpus lookup.** `war-lint` resolves
  identifiers and risk levels through the existing tool so the `HLD` review and the arc42 quality section
  ground claims identically. *Alternative rejected:* a parallel corpus parser inside `war-lint`—a
  second source of truth that would drift (the grep-the-SDK-primitive lesson).

- **D5—First-class but optional schema artifact.** Add an HLD artifact to the `dev-reviewer`
  schema so the deliverable is a named, on-demand output with its own template and owner, without
  making it a required step in every change's lifecycle.

## Risks / Trade-offs

- [Risk] **All-OpenAI review of the architect's own `HLD` is a same-family check.** The architect writes
  the `HLD` and the `spec-reviewer`/`reviewer` (same OpenAI family, per the current config) checks it, so
  correlated blind spots survive. → Mitigation: note it; the operator has chosen all-OpenAI, and the
  `war-lint` gate provides a deterministic backstop independent of any model.
- [Risk] **`HLD` design intent drifts from the shipped code over time.** → Mitigation: the `HLD` cross-links
  the as-built arc42 tree for structural facts rather than copying them, and is regenerated on demand.
- [Risk] **`architect-scope` is a pi-loader-fragile extension.** Editing it can silently break the guard
  (regex literals, backticks, apostrophes). → Mitigation: `just check-extensions` in the task probes;
  the `agent-path-scoping` spec already carries the loader-clean and harness-selftest scenarios.
- [Risk] **Corpus staleness makes findings authoritative-but-old.** → Mitigation: record the corpus tag
  and content hash in the `HLD` provenance, same as the arc42 tree does.

## Architecture impact

This change adds a new documented view (the `HLD`/WAF deliverable) and extends an enforcement boundary
(`architect-scope`). It alters arc42 **§5 Building Block View** (the `war-lint` tool and the `HLD` artifact
as new components) and **§8 Crosscutting Concepts** (agent write-scoping now spans two doc trees). The
`architecture-writer` should refresh those sections at archive.

## Open Questions

1. `HLD` template shape: a single `docs/hld/README.md` with pillar sections, or a section-per-file tree
   like arc42? Lean single-file first (the `HLD` is a narrative deliverable, not a twelve-view tree),
   revisit if it grows.
2. Should `war-lint` join the repo's aggregate gate (for example a `just verify-gate`) or stay standalone and
   on-demand? Default standalone, since the deliverable itself is on-demand.
