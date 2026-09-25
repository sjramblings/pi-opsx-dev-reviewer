# Documentation delta—add-session-cost

## What changed for the reader

`just session-cost <session.jsonl>` reports accepted main-agent and persisted subagent usage by model and as an accepted grand total. It reads native subagent usage from `message.details.results[]` on parent `subagent` tool-result records.

The report labels coverage `complete` when it accepts no diagnostic reason. Otherwise, it labels coverage `incomplete`, lists the reason codes, and states that the accepted total is partial. Valid top-level `subagentCost` annotations are a fallback only when the session has no accepted native child usage.

`just session-cost <session.jsonl> --html` emits an HTML fragment. The implementation escapes dynamic session names, model names, coverage labels, and diagnostic text before it inserts them into the fragment.

The reader-facing recipe descriptions in `README.md` and `index.html` no longer describe current subagent cost as TUI-only.

## Diátaxis map

- `README.md` → README funnel: operational overview of the session-cost rollup.
- `index.html` → reference: recipe catalog entry for `just session-cost`.
- `docs/architecture/06-runtime-view.md` → explanation: persisted parent tool-result accounting boundary.
- `docs/architecture/09-architecture-decisions.md` → explanation: index of accepted accounting ADRs 0003 through 0005.

## Verification

Shipped-code review verified that `tools/session-cost.ts` accepts main cost only from assistant messages, reads native child usage only from `subagent` tool-result `message.details.results[]`, uses native usage ahead of legacy annotations, reports complete or incomplete coverage, and escapes dynamic HTML strings.

Shipped-doc review verified that `README.md` and `index.html` describe persisted subagent usage and no longer claim that current subagent cost is TUI-only. The architecture tree is outside this artifact's ownership boundary.

Final verification evidence:

- `openspec validate add-session-cost --strict` exited 0 and printed `Change 'add-session-cost' is valid`.
- `git diff --check` exited 0 with no output.
