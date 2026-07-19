# Add a blocked-action ledger and its assessment

## Why

Review verdicts (PASS/BLOCK) miss process friction: an action a guard refused, or a command
retried five times. That signal is objective and predictive of a missing rule or dependency,
but the harness threw it away — the guards intercept every tool call yet persist nothing.
pi already logs every call in its session jsonl; the gap is capturing the high-signal
*blocked* subset and *assessing* it into learnings.

## What Changes

- `extensions/lib/tool-events.ts`: a shared, tokenizer-safe, **fail-open** `logBlocked()` that
  appends each blocked call to `memory/tool-events.jsonl` (guard, tool, reason, target, agent).
- The four `tool_call` guards (`force-delegate`, `developer-guard`, `branch-guard`,
  `architect-scope`) call it before every block.
- `tools/assess-tool-events.ts` + `just tool-events`: deterministically mine the ledger (and,
  with `--session`, retry loops in a pi session) into ranked candidate learnings.
- `/opsx-retro` now runs `just tool-events` and folds the signal into its distillation.
- `check-extensions` also lints `extensions/lib/*.ts`; `install.sh --here` copies the tool;
  README + index.html document it.

## Capabilities

- **New Capabilities**: `tool-event-audit`

## Impact

New: `extensions/lib/tool-events.ts`, `tools/assess-tool-events.ts` (+ test). Modified: the
four guards, `justfile.opsx`, `install.sh`, `prompts/opsx-retro.md`, README + index.html. The
logger is fail-open by contract — a write failure never affects a guard decision. `memory/`
stays gitignored. Deliberately NOT logging every call (pi's session jsonl already has those).
