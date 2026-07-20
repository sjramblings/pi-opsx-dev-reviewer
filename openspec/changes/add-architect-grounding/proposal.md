# Ground the solution-architect in the architecture baseline

## Why

The solution-architect settles a change's design after reading the change folder and
`docs/decisions/`, but it never reads `docs/architecture/` — the synthesized arc42 picture of
the system. So it can design a change that quietly contradicts the current building block view or
deployment topology, or reinvents a component that already exists, because it cannot see the
standing structure it is designing against.

This closes a real loop the harness already half-built: the architecture-writer refreshes
`docs/architecture/` at archive; if the architect reads that tree at design time, the documented
architecture informs the next design, which the writer then re-documents. The design stays
consistent with the system, and the writer gets told what changed.

## What Changes

- The solution-architect reads `docs/architecture/` (when it exists) as the current architecture
  baseline before settling a design, and stays consistent with its building block, deployment,
  and decision views or names where it deliberately departs from them.
- The architect records an architecture-impact note in `design.md`: which arc42 sections this
  change alters, so the architecture-writer knows what to refresh at archive.
- The baseline is read as the last-archived state, not ground truth — `docs/architecture/` is a
  derived, archive-time artifact and lags in-flight changes, so the architect treats a conflict
  with it as a prompt to check, not an automatic block.

## Capabilities

### New Capabilities

- `architect-grounding`: the solution-architect reads the architecture baseline and records the change's architecture impact

## Impact

Modified: `agents/solution-architect.md` (a read-the-baseline method step and the impact note in
the report), `openspec/schemas/dev-reviewer/templates/design.md` (an Architecture impact section).
No runtime dependency, no gate change. The impact note is prose the architecture-writer reads at
archive; nothing hard-gates on it in this change.

Stacks on the merged architecture-writer and architecture-doc work already on main.
