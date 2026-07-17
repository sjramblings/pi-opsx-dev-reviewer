# 6. Runtime View

## Scenario 1 — a change is applied through delegation

1. The operator runs the apply flow against an OpenSpec change. The main agent is read-only
   under force-delegate (`extensions/force-delegate/index.ts:6`), so it cannot edit code
   directly.
2. For each pending task it delegates implementation to the `developer` subagent, then
   sends the raw diff to the `reviewer` subagent, quarantining the developer's narrative as
   untrusted (`openspec/schemas/dev-reviewer/schema.yaml:119`).
3. The developer appends the reviewer's verdict verbatim to `review-log.md` before ticking
   the task (`openspec/schemas/dev-reviewer/schema.yaml:68`).
4. After the last task, the architecture and docs artifacts are delegated, then
   `just archive-check` runs (`justfile.opsx:63`).

## Scenario 2 — session start canary

On `session_start`, harness-selftest reads the handshake flag force-delegate sets when it
loads (`extensions/harness-selftest/index.ts:10`). If the flag is absent, it emits the halt
banner (`extensions/harness-selftest/index.ts:22`) — turning a silent enforcer-load failure
into a loud stop.

## Scenario 3 — a write is authorized

On a `write` or `edit` tool call, architect-scope resolves the current agent from
`PI_SUBAGENT_STACK`. An open writer passes; a scoped agent is checked against its path
policy; the architect and any unidentified agent are restricted to design artifacts; an
unparseable target is blocked (`extensions/architect-scope/index.ts:45`). Absolute paths are
resolved through the filesystem before the prefix comparison so a symlinked root does not
cause a false block (`extensions/architect-scope/index.ts:128`).

## Scenario 4 — the architecture gate runs

`just arch-lint` checks stated cost, best-practice identifier resolution, evidence for met
claims, ADR existence, section completeness, and the 42010 checklist, reporting `FAIL`,
`PARTIAL`, `clean`, or `not-found` (`justfile.opsx:44`, `tools/arch-lint.ts`).
