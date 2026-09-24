# Review log—{{change}}

Durable record of every reviewer verdict for this change. The orchestrator appends each
verdict block verbatim before the developer ticks the task by running the concrete
two-argument `just record-verdict` command rendered by the active `/opsx-loop` from its
explicit change-name and parent-session arguments. The session argument must be the exact
absolute `File:` path copied from pi's built-in `/session` command in the same persisted
top-level session. Session discovery fails closed: if the rendered prompt is unavailable or
`/session` reports `In-memory`, stop and re-enter through `/opsx-loop`; never guess a path
or select the newest session.
At archive time, `/opsx-retro` reads this file and ratchets recurring finding classes into
lint rules, `openspec/config.yaml` rules, or `AGENTS.md` lines. This is what stops review
findings from evaporating after a single task.

---

<!-- Appended per task, newest last. Example:

## Task 1.2—implement CSV export

VERDICT: PASS
FINDINGS: none
EVIDENCE CHECK: tsc clean + 12/12 tests exercise the changed branch—yes
-->
