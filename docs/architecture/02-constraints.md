# 2. Constraints

## Technical constraints

| Constraint | Evidence | Consequence for the architecture |
| --- | --- | --- |
| The pi extension loader has a fragile tokenizer that silently disables a file on a regex literal, a raw backtick, or an apostrophe — even inside comments | `extensions/architect-scope/index.ts:17` | Every guard is written with `new RegExp` and string methods, no backticks, no apostrophes; a static scan enforces it (`justfile.opsx:245`). |
| Agent identity is only available through the `PI_SUBAGENT_STACK` environment variable set by `@mjakl/pi-subagent` | `extensions/architect-scope/index.ts:14` | Authorization decisions read that variable; an unset or unparseable value is treated as unidentified and restricted. |
| Subagents run as child pi processes marked by `PI_SUBAGENT_DEPTH` | `extensions/force-delegate/index.ts:15` | The delegation guard no-ops inside subagents, so a delegated writer keeps full tools. |

## Toolchain constraints

- **TypeScript and bun only.** Every engine under `tools/` is TypeScript run by bun
  (`justfile.opsx:36`). The one Python dependency is a third-party skill invoked as a
  subprocess, not owned here (`tools/waf-grounding.ts` calls `python3` for the external
  `wa_lookup.py`).
- **OpenSpec 1.4.1** is the change methodology; the repo carries a custom `dev-reviewer`
  schema (`openspec/schemas/dev-reviewer/schema.yaml:1`).

## Organizational constraints

- Work lands on feature branches through pull requests, never directly on `main`; a guard
  blocks commit, push, and force-push to protected branches
  (`extensions/branch-guard/index.ts:7`).
- A change is not complete until every implemented task has a reviewer verdict recorded in
  its ledger (`openspec/schemas/dev-reviewer/schema.yaml:68`).
