# Review log—add-session-cost

Built directly in Claude Code (outside the pi delegation flow) at the operator's request.

---

## Slice (tasks 1.1–4.1)—direct build, tool-verified

VERDICT: PASS
FINDINGS: the decisive question ("is subagent cost persisted in the session?") was answered
during the build by inspecting real sessions: subagent tool-results are plain text with no
usage/cost, so subagent spend is TUI-only. The tool reports this rather than under-reporting.
EVIDENCE CHECK:

- `bun test tools/session-cost.test.ts` → 5 pass / 0 fail (per-model sum, subagent-not-persisted,
  forward-compat annotation, malformed-line tolerance, empty).
- Real subagent session → main rollup $0.0100 (gpt-5.4-mini) + "1 subagent calls ... NOT in
  this session (TUI-only)".
- Large real session → $1.6526 across 18 gpt-5.5 calls, no subagents (sane).
- `just check-extensions` clean; `bun test tools/` all pass.

## Evidence correction before task 5.1

The tasks 1.1–4.1 verdict remains evidence for the initial implementation, but its persistence
finding is superseded. Inspection of current real parent-session `JSONL` established that
`@mjakl/pi-subagent` persists aggregate child usage in `subagent` tool-result
`message.details.results[]`. Task 5.1 and `design.md` replace the obsolete TUI-only assumption;
the previous finding MUST NOT be used as evidence for current coverage behavior.

<!-- Appended per task, newest last. -->

## Task 5.1

<!-- markdownlint-disable MD032 -->
VERDICT: PASS
FINDINGS (most severe first):
- None.

EVIDENCE CHECK: No—source tests strongly cover core accounting logic, but do not individually assert every renderer-specific scenario or a committed real-session fixture; supplied run results are summary claims rather than raw transcripts.
<!-- markdownlint-enable MD032 -->

## Task 5.2

<!-- markdownlint-disable MD032 -->
VERDICT: PASS
FINDINGS (most severe first):
- None.

EVIDENCE CHECK: No—reported command results are summary claims rather than raw transcripts; source inspection confirms the targeted vocabulary, suppression scope, documentation meaning, ADR index, and Vale severity configuration.
<!-- markdownlint-enable MD032 -->
