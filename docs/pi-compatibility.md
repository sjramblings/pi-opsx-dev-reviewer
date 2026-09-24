# Pi compatibility

This kit depends on pi's extension loader, its `tool_call` event, the `subagent` tool from
`@mjakl/pi-subagent`, and the session JSONL shape that `record-verdict` reads. This page holds
the one statement of which pi version those were last proven against.

## Last verified against pi 0.83.0 (2026-08-02)

Evidence: the `add-worktree-isolation` task 5.1 live shakedown ran every guard and recipe
against the real pi 0.83.0 binary (see [SHAKEDOWN.md](../SHAKEDOWN.md), "Worktree-isolation
live shakedown").

That line is the single source of truth. Any other file that says something was verified or
tested against, with, or on a specific pi version must name the same version, and
`bun test tools/pi-compat.test.ts` fails when one does not. Dated history ("run against pi
0.79.9 on 2026-07-08") is not a claim and stays as written. Files under `openspec/` and test
files (`*.test.ts`) quote versions as examples, so the check skips them.

## What this line means

- It is the version to fall back to if a newer pi breaks something. It is not a ceiling: you
  may run any pi you like.
- `just pi-compat` prints this version next to your installed `pi --version` and says when they
  differ. It never fails on the difference.

## Loader note

pi 0.79.9 silently disabled any extension containing a regex literal or an apostrophe (see
[SHAKEDOWN.md](../SHAKEDOWN.md)). On 2026-09-24 a file containing both loaded without error
through pi 0.83.0's own `loadExtensions`, so the defect does not reproduce there (see
"pi 0.83.0 loader probe" in [SHAKEDOWN.md](../SHAKEDOWN.md)). The
load-breaker rules in `just check-extensions` stay in force, because the kit does not declare
a minimum pi version.

## Bumping the line

1. Install the new pi.
2. Run a live shakedown of the guards and the `/opsx-loop` bookkeeping against it, and record
   the outcome in `SHAKEDOWN.md`.
3. Update the heading above (version and date) and the evidence paragraph.
4. Run `bun test tools/pi-compat.test.ts` and fix any claim it reports.
