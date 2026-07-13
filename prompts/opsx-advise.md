---
description: A commitment-boundary second opinion on the APPROACH (not the spec, not the diff) before you commit.
argument-hint: "<change-name>"
---

# Advise — a second opinion at the commitment boundary

Change: `$1`

The `spec-reviewer` red-teams the spec for testability; the `reviewer` grades the finished
diff. This is the missing middle the Algorithm calls out: a fresh, cross-family opinion on the
**chosen approach** at the three moments that matter — before you commit to it, when you are
stuck, and before you declare done.

Call the `subagent` tool with a cross-family reviewer (e.g. `agent="spec-reviewer"`). Give it
`openspec/changes/$1/proposal.md` and `design.md` (the approach, decisions, and alternatives),
and ask the ONE question for the current boundary:

- **Before build:** Is this the simplest approach that satisfies the spec? What is the
  strongest alternative we are NOT taking, and why might it be better? What gap will bite in
  EXECUTE?
- **When stuck (the same problem resisted two distinct attempts):** Here are both attempts and
  why each failed — what are we assuming that is not true?
- **Before done:** Given the shipped diff and the spec, what is still unverified or out of
  scope that we are treating as done?

Relay the verdict verbatim. This **advises; it does not gate** — but an approach that cannot
survive one skeptical cross-family read before the expensive build usually should not be built.
Log the decision (taken / adjusted / overruled-with-reason) so `/opsx-retro` can see it.
