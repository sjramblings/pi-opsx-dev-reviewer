# Design—add-rukas-grafts

## Context

pi-rukas (Apache-2.0, by Janni Turunen) is a pi extension that moved most of its pipeline
out of prompts and into TypeScript gates, each justified by a measured incident recorded in
its source comments. This change ports five of those ideas. No pi-rukas code is copied; each
gate is re-implemented against this kit's own conventions (bun tools with tests, load-breaker
safe extensions, thin `just` recipes). Two other pi-rukas ideas were evaluated and dropped:
a merge-authority gate (this kit never merges) and a reviewer-verdict rework (the reviewer
already blocks only on a confirmed P0/P1 or a failing probe).

## Goals / Non-Goals

Goals: every gate is deterministic, has a negative test, and runs without network or a model.

Non-goals:

- Carrying findings forward past the cap. pi-rukas lets MEDIUM/HIGH findings proceed to CI
  when posted to the PR; this kit has no PR or CI stage inside the loop, so every capped task
  parks.
- Path redaction in the repeat detector (pi-rukas normalises drifting absolute paths). The
  first cut matches exact inputs only.
- A live Pi event-shape test. Only the version-claim drift gate and an installed-version
  comparison ship now.

## Decisions

**D1. The round cap lives in `record-verdict`, not a new recipe.** The bash of the orchestrator is
pinned by `force-delegate` to read-only commands plus `just record-verdict` and
`just archive-change`. A new park recipe would need a new allowlist entry that writes. Counting
inside `record-verdict`, which already appends to the ledger, adds no new capability. The
`PARKED:` line deliberately does not start with `VERDICT:`, so `archive-check` and `just next`
counts are unchanged. Cap: `OPSX_MAX_BLOCK_ROUNDS`, default 3, invalid values fail closed.
Exit code 3 on park makes the stop unmissable to the orchestrator.

**D2. `diff-gate` strips string literals before matching markers.** Otherwise the gate's own
source and tests, which name the markers as strings, would trip it. Net counting (added minus
removed per file) lets a refactor that moves a skip pass.

**D3. The falsely green check only fires when a task declares a source file.** Docs-only tasks
legitimately change no source. A ticked task that declared source paths and changed none of
its declared paths fails.

**D4. The drift gate polices "verified/tested against pi X" claims only.** Most version
mentions in this repo are dated history ("run against pi 0.79.9 on 2026-07-08") and must stay
as written. Archived changes and probe transcripts are excluded.

**D5. The repeat detector keys on tool name plus canonical JSON input, per process.** Each
subagent is its own pi process, so per-process state is per-agent state. Default limit 8 via
`OPSX_REPEAT_CALL_LIMIT`; a distinct call resets the streak. Ops-style exemptions are
unnecessary: no agent in this kit legitimately issues eight identical calls in a row.

**D6. `claim-scan` backs a token by any other file.** Truth has no oracle; presence does. A
version or size added to a doc must occur in some file other than the one asserting it, and a
relative file path in backticks must exist.

## Risks / Trade-offs

- [Risk] The repeat detector blocks a legitimate polling loop → Mitigation: the limit is an
  environment variable, and a blocked call is logged to `memory/tool-events.jsonl`, so
  `just tool-events` shows it.
- [Risk] `claim-scan` flags a true fact that lives only in the doc → Mitigation: the fix is
  to cite the source file, which is the behaviour the gate exists to force.
- [Risk] Naive string stripping in `diff-gate` mis-parses an exotic line → Mitigation: the
  failure mode is a false positive that names the file and line.

## Migration Plan

None. Existing ledgers parse unchanged; installed projects pick up the extension on their
next `install.sh --here`.

## Open Questions

None.

## Credit

Ideas ported from pi-rukas, Apache-2.0: loop-bounded fix rounds (`AGENTS.md` §1), skip-marker
ratchet (`work-driver-skip-ratchet.ts`), falsely green check (`work-driver-falsily-green.ts`),
streak loop detector (`loop-detector.ts`), Pi compatibility line and drift gate
(`docs/pi-compatibility.md`), and claim scan (`claim-scan.ts`).
