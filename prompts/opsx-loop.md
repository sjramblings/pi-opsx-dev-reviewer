---
description: Drive an openspec change through the developer + reviewer subagents, one task at a time.
argument-hint: "<change-name>"
---

# Apply an `openspec` change via delegation

Change to work: `$1`

Run every incomplete task in this change through the two-subagent protocol. Do NOT
implement any task yourself—you orchestrate; the subagents do the work.

## Loop

1. `openspec show $1` (or read `openspec/changes/$1/tasks.md`) to list tasks.
2. BRIEF context—so recurring pitfalls reach the developer before the reviewer re-catches them:
   - Read `AGENTS.md` (if present) for global, always-on invariants.
   - Read `openspec/changes/$1/review-log.md` (if present) for this change's prior verdicts.
   - Run `just learnings-preview` to fetch the **scoped** learnings whose glob matches the
     files this change touches—fold those into the developer's brief too.
3. For the next unchecked task, in order:
   a. Call the `subagent` tool with `agent="developer"`, a prompt containing the task
      text AND the path `openspec/changes/$1/`, plus any relevant pitfalls from step 2.
   b. When the developer returns, call `subagent` with `agent="reviewer"`. Pass the raw
      diff and the developer's verbatim VERIFIED output as evidence; quarantine the
      developer's narrative as untrusted claims.
   c. Append the reviewer's verdict block verbatim to
      `openspec/changes/$1/review-log.md` (the developer does this write—you are
      read-only under force-delegate).
   d. On `VERDICT: PASS` (no P0/P1) the developer ticks the task `[x]`. On `BLOCK`,
      hand the findings back to the developer and repeat from (a).
4. Work tasks sequentially; one delegation per task; stop when all tasks are `[x]`.

## Dispatch: sequential by default, concurrent only when provably safe

Sequential is the default and it is not negotiable by convenience. Two write-agents on one working
tree have already caused a repository-revert collision in this repo, so concurrency needs a positive
safety proof, not the absence of an obvious conflict.

Dispatch two tasks concurrently ONLY when all three hold:

1. **Different `parallel:` groups.** Tasks carry a `parallel:` line in `tasks.md`. A task marked
   `parallel: none` names its predecessor and never runs early. Same group means same dependency
   chain—run them in order.
2. **Disjoint `files:` sets.** Compare the `files:` lines literally, and treat a glob as covering
   everything under it. Any overlap, including a shared `justfile.opsx` or a shared test file, means
   sequential. Shared *state* counts too: two tasks that both trigger a dependency install or both
   append to a ledger are not disjoint even when their `files:` differ.
3. **Worktree isolation is active** (`add-worktree-isolation` landed, each concurrent developer in its
   own worktree). Until then, treat every task as conflicting and run the loop strictly sequentially,
   regardless of what the annotations say.

If any of the three is unproven, run sequentially. The annotations exist so this becomes a switch you
can throw later; they are not permission to throw it now.

The reviewer is read-only and never writes, so a review may always overlap the next brief-building
step—but never dispatch a second *developer* on an unproven pair.

When the change is complete, suggest `/opsx-retro $1` before archiving.
