---
description: Drive an OpenSpec change through the developer + reviewer subagents, one task at a time.
argument-hint: "<change-name>"
---

# Apply an OpenSpec change via delegation

Change to work: `$1`

Run every incomplete task in this change through the two-subagent protocol. Do NOT
implement any task yourself — you orchestrate; the subagents do the work.

## Loop

1. `openspec show $1` (or read `openspec/changes/$1/tasks.md`) to list tasks.
2. BRIEF context — so recurring pitfalls reach the developer before the reviewer re-catches them:
   - Read `AGENTS.md` (if present) for global, always-on invariants.
   - Read `openspec/changes/$1/review-log.md` (if present) for this change's prior verdicts.
   - Run `just learnings-preview` to fetch the **scoped** learnings whose glob matches the
     files this change touches — fold those into the developer's brief too.
3. For the next unchecked task, in order:
   a. Call the `subagent` tool with `agent="developer"`, a prompt containing the task
      text AND the path `openspec/changes/$1/`, plus any relevant pitfalls from step 2.
   b. When the developer returns, call `subagent` with `agent="reviewer"`. Pass the raw
      diff and the developer's verbatim VERIFIED output as evidence; quarantine the
      developer's narrative as untrusted claims.
   c. Append the reviewer's verdict block verbatim to
      `openspec/changes/$1/review-log.md` (the developer does this write — you are
      read-only under force-delegate).
   d. On `VERDICT: PASS` (no P0/P1) the developer ticks the task `[x]`. On `BLOCK`,
      hand the findings back to the developer and repeat from (a).
4. Work tasks sequentially; one delegation per task; stop when all tasks are `[x]`.

When the change is complete, suggest `/opsx-retro $1` before archiving.
