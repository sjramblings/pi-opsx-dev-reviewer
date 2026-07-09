# Design

## Context
`architect-scope/index.ts` currently returns early (no-op) unless
`currentAgent() === "solution-architect"`. The gate only engages for the architect; every
other case — including an unidentified agent from a missing/renamed stack — keeps full
write. That is fail-open.

## Decisions
- **Default-deny the write boundary, not the agent match.** Keep the fast path that lets a
  positively-identified non-architect agent (developer) through untouched, so the harness
  still works. But when the agent is `solution-architect` OR cannot be identified at all,
  apply the design-artifact allowlist and block anything outside it.
- **Positive identification required to bypass.** "Unknown agent" must resolve to the
  restricted path, never the unrestricted one. Reversibility: two-way door (single file).

## Risks / Trade-offs
- [A future stack-format change blocks a legitimately-identified developer] → the developer
  path keys on a positive match to a known non-architect name, so a malformed stack falls
  into the restricted path (safe) rather than silently unrestricting.

## Open Questions
None.
