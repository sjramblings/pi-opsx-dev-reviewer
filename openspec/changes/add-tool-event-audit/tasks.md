# Tasks — add-tool-event-audit

> Built + verified directly this session; evidence in review-log.md.

## 1. Blocked-action ledger

- [x] 1.1 `extensions/lib/tool-events.ts` — shared, tokenizer-safe, fail-open `logBlocked()`
      appending to `memory/tool-events.jsonl`.
      probe: `just check-extensions` lints it clean; a synthetic block writes a well-formed JSON line.
- [x] 1.2 Wire `logBlocked` into force-delegate, developer-guard, branch-guard, architect-scope
      before every block; `bun build` each resolves the `../lib` import.
      probe: `bun build extensions/*/index.ts` clean; a developer-guard block writes an event.

## 2. Assessment

- [x] 2.1 `tools/assess-tool-events.ts` + test — aggregate blocked events by guard/tool (ranked)
      and detect session retry loops; render candidate learnings; clean-on-empty.
      probe: `bun test tools/assess-tool-events.test.ts` passes; end-to-end (guard blocks 3 → assess shows the class).
- [x] 2.2 `just tool-events` recipe.
      probe: `just tool-events` runs and reports classes or "clean".

## 3. Wiring + docs

- [x] 3.1 `/opsx-retro` runs `just tool-events` and folds the signal in; `check-extensions`
      lints `extensions/lib/*.ts`; `install.sh --here` copies the tool; README + index.html
      document the ledger, the assessment, and opsx-reminder in the extensions table.
      probe: greps for `tool-events` in opsx-retro, install.sh, README, index.html; check-extensions clean.

## 4. Guard

- [x] 4.1 All tool tests pass; no pi load-breakers.
      probe: `bun test tools/` all pass; `just check-extensions` exits 0.

## 5. Deferred

- [ ] 5.1 Live-pi-load verification of the modified guards (bun build + check-extensions pass,
      but only `force-delegate` has a load canary; extend `harness-selftest` to canary all four
      guards so a broken import in developer-guard/branch-guard/architect-scope also HALTs loudly).
      probe: harness-selftest HALTs if ANY guard failed to load, verified in a real pi session.
