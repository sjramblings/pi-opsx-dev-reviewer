# Design — add-architect-grounding

## Context

Every agent runs as a fresh isolated process; its `Task:` brief is its entire input. The
solution-architect gathers its own context — the change folder, `specs/`, `docs/decisions/`, and
the surrounding code — but not `docs/architecture/`, the arc42 synthesis the architecture-writer
produces. The two agents never meet: the writer documents the architecture at archive, the
architect designs the next change blind to that document.

## Goals / Non-Goals

**Goals:**

- The architect designs consistently with the documented architecture, or names where it departs.
- The architect tells the architecture-writer what its change alters.
- The staleness of a derived, archive-time baseline is handled honestly.

**Non-Goals:**

- Hard-gating on the architecture baseline. It is context, not a contract.
- Making `docs/architecture/` a required input — it may not exist yet in a repo.
- Auto-updating the architecture tree from the architect. The writer still owns that at archive.

## Decisions

**Read the baseline as context, weight it as last-archived.** The architect reads
`docs/architecture/` when present and stays consistent with its views, but treats a conflict as a
signal to check rather than an automatic block, because the tree lags in-flight changes.
Consequence: the architect gains standing-structure context for free, at the cost of having to
judge baseline-vs-current rather than trusting the tree blindly — which is the correct posture for
a derived artifact.

**Record architecture impact in design.md, not a new artifact.** The architect names which arc42
sections its change alters in an Architecture impact section of the existing `design.md`, rather
than a new file.
Consequence: the architecture-writer reads one known place at archive to know what to refresh, and
no new artifact or gate is added; the note is prose, so it informs rather than enforces.

**No gate in this change.** The impact note and the baseline read are behavioural, enforced by the
agent instruction and visible in the architect report, not by `arch-lint` or a new check.
Consequence: cheap and reversible; if the loop proves valuable, a later change can gate the impact
note against the writer's refresh.

## Risks / Trade-offs

- **A stale baseline misleads the architect.** Mitigation: the instruction weights it as
  last-archived context and treats conflicts as prompts to verify, not blocks.
- **The impact note drifts from what the writer refreshes.** Mitigation: it is a hint, not a
  contract, this change; gating it is a deliberate later step.
- **Larger architect context = more tokens.** Reading the arc42 tree adds input. Mitigation: it is
  read only when present, and the tree is small relative to the code the architect already reads.
- **Behavioural-only enforcement can be ignored.** Mitigation: the architect report surfaces the
  impact note, so its absence is visible to the reviewer.
