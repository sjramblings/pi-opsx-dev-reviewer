# repo-level `HLD` + Well-Architected review from the solution-architect

## Why

The harness documents architecture two ways today, and both are as-built: `architecture-writer`
derives a descriptive arc42 tree from shipped code and deliberately refuses design intent
("document what IS ... not what the proposal hoped would exist"), and `arch-lint` grounds
Well-Architected *identifiers* only as evidence for quality claims about what already exists. Neither
produces an **evaluative, stakeholder-grade High-Level Design**—a design document that states the
target architecture and its drivers and then assesses it against the AWS Well-Architected Framework
pillar by pillar, with risk-rated findings and recommendations. That is the deliverable an
engagement expects, and the kit cannot produce it.

The right owner is the `solution-architect`: it already settles design intent, so an evaluative `HLD`
is native to its role rather than a contradiction of it. Bolting this onto `architecture-writer`
would corrupt the property that makes its as-built tree trustworthy—its refusal of intent.

## What Changes

- The `solution-architect` gains a **repo-level** `HLD` + Well-Architected review deliverable under a
  new `docs/hld/` tree: context and drivers, target architecture, key decisions and trade-offs, and a
  full six-pillar WAF assessment (Operational Excellence, Security, Reliability, Performance
  Efficiency, Cost Optimization, Sustainability). Each finding carries a HIGH/MEDIUM/LOW risk rating
  and a recommendation, and every WAF claim is grounded in the synced corpus.
- It is a repo/solution-level artifact produced on demand—like `architecture-writer`'s tree, NOT a
  per-change gate—so an ordinary change never drags a six-pillar audit. It cross-links the arc42
  tree for as-built facts rather than re-deriving them.
- `architect-scope` extends the `solution-architect` write policy to include `docs/hld/`, without
  loosening any other agent and without touching `docs/architecture/**` (architecture-writer's
  exclusive tree).
- A `war-lint` gate fails loudly on an incomplete assessment: a missing pillar, a finding with no
  risk rating, or a WAF identifier that does not resolve against the corpus.

## Capabilities

### New Capabilities

- `hld-war-assessment`: the solution-architect produces a repo-level `HLD` plus a six-pillar, risk-rated, corpus-grounded Well-Architected review under `docs/hld/`
- `war-lint`: a gate that fails on incomplete pillar coverage, unrated findings, or ungrounded WAF identifiers

### Modified Capabilities

- `agent-path-scoping`: the `solution-architect` write policy additionally allows `docs/hld/`

## Impact

Modified: `agents/solution-architect.md` (an `HLD`/WAF method and report block), `extensions/architect-scope/index.ts`
(the solution-architect path policy plus `docs/hld/`), `openspec/schemas/dev-reviewer/schema.yaml`
(a new optional HLD artifact so the deliverable is a first-class, on-demand output), a new
`tools/war-lint.ts` gate wired into `justfile.opsx`. Reuses `tools/waf-grounding.ts` and the synced
Well-Architected corpus for identifier and risk grounding—no new corpus plumbing. No production
runtime code and no new dependency. Stacks on the merged architecture-writer / arch-lint work on main.
