# Review log — add-session-cost

Built directly in Claude Code (outside the pi delegation flow) at the operator's request.

---

## Slice (tasks 1.1–4.1) — direct build, tool-verified

VERDICT: PASS
FINDINGS: the decisive question ("is subagent cost persisted in the session?") was answered
during the build by inspecting real sessions: subagent tool-results are plain text with no
usage/cost, so subagent spend is TUI-only. The tool reports this rather than under-reporting.
EVIDENCE CHECK:
- `bun test tools/session-cost.test.ts` → 5 pass / 0 fail (per-model sum, subagent-not-persisted,
  forward-compat annotation, malformed-line tolerance, empty).
- Real subagent session → main rollup $0.0100 (gpt-5.4-mini) + "1 subagent call(s) ... NOT in
  this session (TUI-only)".
- Large real session → $1.6526 across 18 gpt-5.5 calls, no subagents (sane).
- `just check-extensions` clean; `bun test tools/` all pass.

<!-- Appended per task, newest last. -->
