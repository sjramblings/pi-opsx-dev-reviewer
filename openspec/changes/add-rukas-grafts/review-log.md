# Review log—add-rukas-grafts

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

> **Provenance.** This change was built from Claude Code, not through `/opsx-loop`, so these
> entries were recorded by hand rather than by `just record-verdict`. The reviewer was an
> independent (non-forked) Claude Opus agent. The planned cross-vendor pass did not run: the
> codex CLI failed its models refresh (`unknown variant max`). Treat both passes as
> same-family review. Pass 1 reviewed `wip/2026-08-snapshot..8535fa8`; pass 2 reviewed
> `..d3a19e5`. Findings are summarised; the probes named were run by the reviewer in
> scratch clones.

## Task 1.1

FINDINGS (most severe first):
- P3 CONFIRMED tools/record-verdict.ts A BLOCK recorded after the task was parked returned `appended` / exit 0, so an orchestrator that ignored one stop got no second one.

EVIDENCE CHECK: record-verdict tests pass (park at 3, under cap, invalid cap fails closed before append). PARKED lines never begin with `VERDICT:`.

VERDICT: PASS

## Task 1.2

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: `prompts/opsx-loop.md`, `schema.yaml` and `apply-policy.config.yaml` each carry the parked-stop instruction.

VERDICT: PASS

## Task 2.1

FINDINGS (most severe first):
- P2 CONFIRMED tools/diff-gate.ts Skip ratchet evaded by `it.skip (`, a leading `/* */` or `*/`, `test.skipIf(`, a template-string close, and `it["skip"]`.
- P3 CONFIRMED tools/diff-gate.ts A task passes falsely-green if any declared path (docs included) changed; matches the spec wording.

EVIDENCE CHECK: diff-gate tests pass; `--base` resolves through `rev-parse --end-of-options`; `--change` is one path segment.

VERDICT: PASS

## Task 3.1

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: detector tests pass; `just check-extensions` clean and its glob covers the file; source has no regex literals, backticks, or apostrophes.

VERDICT: PASS

## Task 4.1

FINDINGS (most severe first):
- P3 CONFIRMED tools/pi-compat.ts Spec said "a line", code requires a level-two heading.
- P3 CONFIRMED tools/pi-compat.ts Claim regex missed two-part versions.
- P3 PLAUSIBLE docs/pi-compatibility.md The 2026-09-24 loader probe was not recorded anywhere.

EVIDENCE CHECK: `bun tools/pi-compat.ts` exits 0; tests pass.

VERDICT: PASS

## Task 5.1

FINDINGS (most severe first):
- P3 CONFIRMED tools/claim-scan.ts Backticked `..` paths were probed outside the repository.

EVIDENCE CHECK: claim-scan tests pass; `just claim-scan` clean on the branch.

VERDICT: PASS

## Task 5.2

FINDINGS (most severe first):
- P0 CONFIRMED justfile.opsx + extensions/architect-scope/index.ts The reviewer could execute any command: `just diff-gate \$\(touch\ x\)` or an ANSI-C quoted `$'\x24\x28...'` passed the gate (it sees only literal `$(`), and just pasted the unquoted `{{flags}}` into sh, which ran the substitution. Probe: both payloads created files in a scratch clone.
- P1 CONFIRMED (pre-existing) `just verify-gate run-probe <change> <id> <cmd>` makes just run `run-probe`, whose `bash -c` executes the command.
- P1 CONFIRMED (pre-existing, out of scope) `git` in the read-only list takes any arguments: `git -c core.fsmonitor=<cmd> status` executes a command.

EVIDENCE CHECK: architect-scope tests passed but did not cover escaped payloads.

VERDICT: BLOCK

## Task 6.1

FINDINGS (most severe first):
- P2 CONFIRMED README.md, ADR 0006 "The reviewer gains read-only gates without a write path" was false while the 5.2 P0 stood.
- P3 PLAUSIBLE ADR 0006, design.md Claims about pi-rukas and its author were not backed by a citation.

EVIDENCE CHECK: docs contracts pass apart from a gitignored-file environment gap; README, index.html and ADR otherwise match shipped behaviour.

VERDICT: PASS

## Task 5.2 (re-review)

Fixes: `60a9a97` (positional arguments in both recipes; plain-token rule for every `just` argument in architect-scope; no arguments for verify-gate, docs-lint, arch-lint) and `cde5503` (fixed-arity recipes capped at their parameter count, closing `just probe-check x run-probe ...`, which the reviewer independently reproduced before the fix landed).

FINDINGS (most severe first):
- P3 CONFIRMED extensions/architect-scope/index.ts A `~` token is admitted and the outer shell expands it; only read-side effects follow (`probe-check ~` tests for a file, `diff-gate --base ~` is refused as not a commit).
- P1 CONFIRMED (pre-existing, out of scope, recorded in ADR 0006) `git -c core.fsmonitor=<cmd> status` still executes.

EVIDENCE CHECK: every first-pass payload, the verify-gate and probe-check chains, `--set`, `-f`, `--justfile`, `x=y`, `run-probe::x`, and tab-separated forms are BLOCKED at the gate; variadic recipes absorb surplus tokens and the tools reject them with exit 2; no file was written.

VERDICT: PASS

## Tasks 1.1, 2.1, 4.1, 5.1, 6.1 (re-review)

Fixes: `156fb85`, `b7523a1`, `d3a19e5`.

FINDINGS (most severe first):
- P3 CONFIRMED tools/diff-gate.ts A trailing `// it.skip(` comment counts as a marker (false positive, fails safe). Template-string close and `it["skip"]` remain documented limits.
- P3 PLAUSIBLE tools/pi-compat.ts A two-part claim naming the canonical minor (`pi 0.83`) is reported as drift (false positive, fails safe).

EVIDENCE CHECK: record-verdict re-signals parked on every later BLOCK; diff-gate counts all four fixed evasion shapes; claim-scan skips out-of-repo paths; README and ADR now name both write paths and how each closed; SHAKEDOWN.md records the loader probe; docs contracts 47/47; `openspec validate --strict` valid; `just check-extensions` clean.

VERDICT: PASS
