# Port five executed-evidence gates from pi-rukas

## Why

A review of [trail-openers/pi-rukas](https://github.com/trail-openers/pi-rukas), a pi
orchestrator whose gates were each written after a measured failure, found five gaps in this
kit. The `/opsx-loop` fix loop has no bound: on `BLOCK` it repeats forever. `verify-gate`
cannot see a net-new skipped test or a ticked task that changed none of its declared files.
Nothing notices a subagent calling the same tool with the same input over and over. Pi version
statements disagree across files. Documentation prose can assert specifics nobody checks.

## What Changes

- `record-verdict` counts `BLOCK` rounds per task and, at a cap of three, appends a `PARKED`
  entry and exits non-zero; `/opsx-loop` stops on it instead of re-dispatching.
- A new `just diff-gate` fails on net-new test skip or focus markers, and on a ticked task
  whose declared source files are all unchanged.
- A new `repeat-call-detector` extension blocks the Nth identical consecutive tool call from
  any agent.
- A new `docs/pi-compatibility.md` holds the one "last verified against" Pi version; a test
  fails when any other verified-against claim disagrees, and `just pi-compat` compares it with
  the installed binary.
- A new `just claim-scan` flags version numbers, sizes, and repo paths added to docs that no
  other file backs; the tech-writer runs it before returning.
- The reviewer's gated bash admits `just diff-gate` and `just claim-scan`.

## Capabilities

- `fix-loop-cap` (new)
- `diff-gate` (new)
- `repeat-call-detector` (new)
- `pi-compatibility` (new)
- `docs-claim-scan` (new)

## Impact

- Code: `tools/record-verdict.ts`, new `tools/diff-gate.ts`, `tools/pi-compat.ts`,
  `tools/claim-scan.ts`, new `extensions/repeat-call-detector/`, `extensions/architect-scope/index.ts`
  (reviewer allowlist), `justfile.opsx` (three recipes).
- Prompts and agents: `prompts/opsx-loop.md`, `agents/reviewer.md`, `agents/tech-writer.md`.
- Docs: `README.md`, `index.html`, `docs/pi-compatibility.md`, one ADR.
- No new dependencies. Installed projects receive the new extension through the existing
  `install.sh` loop over `extensions/*`.
