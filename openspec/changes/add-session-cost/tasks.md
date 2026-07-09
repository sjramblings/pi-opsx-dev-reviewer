# Tasks — add-session-cost

> Built + verified directly this session; evidence in review-log.md.

## 1. Rollup tool

- [x] 1.1 `tools/session-cost.ts` — sum main cost per model + grand total, count + report
      subagent calls (TUI-only), forward-compat `subagentCost`, `--html` fragment; + test.
      probe: `bun test tools/session-cost.test.ts` passes; run against a real session prints a per-model total.
- [x] 1.2 `just session-cost <session>` recipe.
      probe: `just session-cost <real-session.jsonl>` prints a grand total and exits 0.

## 2. Coverage honesty

- [x] 2.1 A session with subagent calls reports them as not-persisted, not silently omitted.
      probe: running against a real subagent session prints "N subagent call(s) ... NOT in this session".

## 3. Wiring + docs

- [x] 3.1 `install.sh --here` copies session-cost.ts; `index.html` documents the recipe.
      probe: `grep -q session-cost install.sh` and `grep -q session-cost index.html`.

## 4. Guard

- [x] 4.1 All tool tests pass, no load-breakers.
      probe: `bun test tools/` all pass; `just check-extensions` exits 0.

## 5. Deferred — persist subagent cost (the surfaced follow-up)

- [ ] 5.1 Persist subagent aggregated cost into the parent session (fork-mode sessions or a
      subagent-cost hook writing `subagentCost`) so `pi --export` and this rollup are complete.
      probe: a session using subagents carries a subagentCost record and session-cost includes it.
