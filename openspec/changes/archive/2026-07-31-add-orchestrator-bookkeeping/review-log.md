# Review log—add-orchestrator-bookkeeping

Durable record of every reviewer verdict for this change. The developer appends each verdict block
verbatim before ticking the task. At archive time, `/opsx-retro` reads this file and ratchets recurring
finding classes into lint rules, `openspec/config.yaml` rules, or `AGENTS.md` lines. This is what stops
review findings from evaporating after a single task.

Note: task 4.1 changes who writes this file. From the moment section 3 lands, entries are appended by
`just record-verdict`, verbatim from the session transcript, rather than by the developer subagent. The
format is unchanged so `just archive-check` continues to read it.

---

<!-- Appended per task, newest last. No tasks implemented yet—this change is a plan awaiting spec review. -->

## Pre-code evidence (recorded at propose time)

Not a per-task apply verdict. These are the measured findings the proposal and design rest on, recorded
here so a reviewer can check the claims rather than take them on narrative.

EVIDENCE: `openspec archive <change> -y` run against copies of this repo's own changes
(`add-architecture-diagrams`, `add-hld-war-assessment`) in an isolated scratch tree.

- ADDED path correct: `+6, ~0, -0, →0` across three capabilities; 108 insertions / 6 deletions; every
  pre-existing requirement preserved. Custom `dev-reviewer` schema handled; `review-log.md` moved with
  the folder; incomplete tasks warned (8/10, 0/8) and continued under `-y`.
- MODIFIED path destructive on partial deltas: a synthetic delta restating one new scenario for a
  requirement whose main spec held two others reduced the capability from 7 scenarios to 6 and removed
  the requirement's descriptive body. This is the defect task 2.1 reproduces as a red probe.
- Delta-shape census across all changes including `archive/`: 28 `## ADDED` vs 1 `## MODIFIED`, and
  that single MODIFIED was a full restatement the CLI promoted correctly.

EVIDENCE: transcript shape for D2 confirmed against a real session with 103 `subagent` calls—all
`role: "toolResult"`, `content` an array, child's full final text present at `content[0].text`.
`tools/session-cost.ts` line 290 already reads this record; ADR-0003 documents the persistence
contract.

EVIDENCE: `agents/reviewer.md` frontmatter is `tools: read,find,ls,grep`—no write, no bash—so the
reviewer cannot record its own verdict without breaking the de-bias property.

OPEN: spec red-team (`spec-reviewer`) has NOT yet run against this change. Per the schema's design
instruction, a cross-family `spec-reviewer` must red-team these specs for ambiguity, missing cases, and
untestable requirements, and any P0/P1 must be resolved BEFORE apply begins.

## Task 1.1 — First reviewer output

FINDINGS (most severe first):
- [P1][CONFIRMED] Malformed non-subagent tool results are silently ignored — `tools/record-verdict.ts:93-96`
  - scenario: A transcript contains a valid reviewer `subagent` verdict plus `{type:"message", message:{role:"toolResult", toolName:"read"}}` with absent `content`. The recorder appends the verdict, although the spec requires any transcript entry with absent/non-array `content` to fail without writing.
  - fix: Validate `message.content` is an array for every transcript message/tool-result before filtering by `toolName`; emit a named malformed-transcript error before opening the ledger.

EVIDENCE CHECK: No — the reported CLI probe setup and byte-comparison inputs are omitted, and no committed task-specific fixture/test exists yet.

VERDICT: BLOCK

## Task 1.1 — Second reviewer output

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—the supplied probes exercise the prior malformed non-subagent regression, verbatim last-verdict selection, and sequential idempotence; source inspection confirms fail-closed validation occurs before any ledger write.

VERDICT: PASS

## Task 1.2

VERDICT: PASS
FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes — the seven committed named tests directly cover every required case, including fail-closed malformed non-subagent results and byte-identical preservation.

## Task 1.2 supplementary-review

VERDICT: PASS
FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Static inspection confirms `justfile.opsx:103-104` is a one-command wrapper with both arguments shell-quoted; it performs no shell mutation. `bun test tools/record-verdict.test.ts` independently passed (7/7). The reviewer guard blocked independent `just --show`/dry-run execution.

## Task 2.1

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes for shipped behavior—independently ran `bun test tools/promote-guard.test.ts` (6 passed); tests exercise real `openspec archive` loss and guard refusal/non-mutation. The historical red-first run is not independently recoverable from the untracked tree.

VERDICT: PASS

## Task 2.2

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: No—independently ran `bun test tools/promote-guard.test.ts` (6 pass) and inspected the recipe, but permitted verifier commands could not rerun the destructive archive integration; supplied integration output is untrusted.

VERDICT: PASS

## Task 3.1 — First reviewer output

VERDICT: BLOCK
FINDINGS (most severe first):
- [P1][CONFIRMED] `just check-extensions` does not enforce the required even double-quote count—`justfile.opsx:332-343`.
  scenario: Adding one `"` to a `force-delegate` comment keeps TypeScript valid and evades the raw-backtick, apostrophe, and regex-literal checks; the recipe reports clean while the pi tokenizer can disable the guard.
  fix: Add a per-file double-quote parity assertion to `check-extensions` and fail with a named load-breaker.

EVIDENCE CHECK: No—the unit suite independently passes, but the claimed loader audit is not implemented by the checked-in gate; `just verify-gate` was only PARTIAL (tsc/eslint/semgrep unavailable).

## Task 3.1 — Second reviewer output

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—parity is per discovered source/installed extension file and fails closed on count errors, non-numeric output, or odd counts. Independently passed `bun test extensions/force-delegate` (15) and `bun test` (162); `verify-gate` remains PARTIAL for unavailable tooling.

VERDICT: PASS

## Task 3.2

VERDICT: PASS

FINDINGS (most severe first):
- [P2][CONFIRMED] Unrelated Markdown corruption remains—`SHAKEDOWN.md:1` changes `# Shakedown log` to an unclosed-code-span heading (`# \`Shakedown log`). Restore the original heading. The diff establishes five pre-existing replacements but cannot establish their provenance.

EVIDENCE CHECK: Yes for task 3.2: source/installed guards are byte-identical; TypeScript and 15 force-delegate tests pass; memory lines 242–243 are real main-agent `force-delegate` blocks matching the recorded `rm` and `just deploy`; the transcript records both admitted recipes succeeding. The installer’s later same-file tools-copy failure does not undermine the guard shakedown because extension copying completed first and was independently compared.

## Task 4.1 — First reviewer output

FINDINGS (most severe first):
- [P1][CONFIRMED] Session argument is an unusable shell redirection—`prompts/opsx-loop.md:27` (repeated as an unresolved placeholder in schema/template)
  scenario: Following `just record-verdict $1 <session.jsonl>` literally redirects stdin and supplies no second recipe argument; the shell fails if absent, or `just` rejects the missing `session` argument. The ledger is never recorded or ticked.
  fix: Specify a concrete, documented way to obtain/pass the current parent session JSONL path, using a real variable/path argument rather than `<session.jsonl>`.

EVIDENCE CHECK: No—the schema/status checks validate structure, not execution of the prompt’s session-path command.

VERDICT: BLOCK

## Task 4.1 — Second reviewer output

VERDICT: BLOCK
FINDINGS (most severe first):
- [P1][CONFIRMED] Generated review ledgers still assign the write to the developer—`openspec/schemas/dev-reviewer/templates/review-log.md:3`
  scenario: A new dev-reviewer change generates `review-log.md`; its opening instruction says “The developer appends each verdict block,” contradicting the loop/schema/AGENTS requirement that the orchestrator invokes `just record-verdict` before the tick.
  fix: Update this template (and the duplicate `templates/review-log.md`) to name the orchestrator’s rendered two-argument recipe and fail-closed session-path workflow.

EVIDENCE CHECK: No—the 162 passing tests do not exercise generated protocol-template content; Pi’s prompt-template implementation does correctly parse quoted positional `$1`/`$2`, and `/session` does render `File:` / `In-memory` as described.

## Task 4.1 — Third reviewer output

VERDICT: BLOCK
FINDINGS (most severe first):
- [P1][CONFIRMED] Lifecycle helper still emits the obsolete, unsafe close-out path—`justfile.opsx:577-579`
  scenario: `just next <in-progress-change>` tells the operator to run `/opsx-loop <change>` without the now-required session JSONL argument, which deterministically fails the new fail-closed prompt. Once tasks are complete, it instead directs `just archive-check` then raw `openspec archive`, bypassing required `just archive-change` promotion protection.
  fix: Update `next` to instruct `/session` followed by the two-argument `/opsx-loop`, and use `/opsx-retro <change>` then `just archive-change <change>` for close-out.

EVIDENCE CHECK: No—the new test is meaningful for both resolved and standalone ledger templates (independently passed 2/2), and schema validation/status passed, but it does not exercise the stale `just next` lifecycle instructions.

## Task 4.1 — Fourth reviewer output

FINDINGS (most severe first):
- [P1][CONFIRMED] `just next` emits an unquoted session positional path—`justfile.opsx:577`
  - scenario: `/session` returns an absolute `File:` path containing a space. Copying `just next`’s `/opsx-loop <change> /absolute/path/...` output splits that path into multiple arguments; `$2` becomes a truncated path and `just record-verdict "$1" "$2"` fails to read the transcript.
  - fix: Emit `/opsx-loop {{change}} "/absolute/path/to/session.jsonl"` and assert the quotes in `tools/next-lifecycle.test.ts:36`.
  - The protocol itself establishes quoted paths as required (`templates/AGENTS.md:14`), so the lifecycle helper currently contradicts it.

EVIDENCE CHECK: No—the independently passing lifecycle tests (2/2) exercise the real copied justfile but assert the unquoted form; full `bun test` also passes (166), so neither catches spaced absolute paths.

VERDICT: BLOCK

## Task 4.1 — Fifth reviewer output

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Stale close-out paths bypass or block the guarded archival flow—`prompts/opsx-retro.md:36`; `openspec/specs/project-onboarding/spec.md:68`
  scenario: After completion, `just next` emits `/opsx-retro <change>`, then `just archive-change <change>` (`justfile.opsx:579`). But `/opsx-retro` instructs `openspec archive $1`, which `force-delegate` blocks because `archive` is not read-only; unguarded execution bypasses `archive-check` and `promote-guard`. The main lifecycle spec also still requires the obsolete `archive-check` then raw archive sequence.
  fix: Make `/opsx-retro` end with `just archive-change $1`, and add a project-onboarding spec delta updating the completed-lifecycle scenario. Add regression coverage for both.
  
EVIDENCE CHECK: No—the independently run full suite passed (166), including 16 protocol/lifecycle tests, but none tests `/opsx-retro`’s terminal command or the stale project-onboarding lifecycle contract.

VERDICT: BLOCK

## Task 4.1 — Sixth reviewer output

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes for task 4.1—independently ran `bun test tools/next-lifecycle.test.ts` (3 passed); verified both `project-onboarding` MODIFIED requirements fully preserve main bodies/scenarios while replacing only close-out semantics, and checked the enumerated lifecycle surfaces contain no stale close-out path.

VERDICT: PASS

## Task 4.2 — First reviewer output

FINDINGS (most severe first):
- [P1][CONFIRMED] Fallback performs an unguarded manual whole-change archive—`.pi/skills/openspec-archive-change/SKILL.md:79-95`; `.cursor/skills/openspec-archive-change/SKILL.md:79-95`
  scenario: Guard refuses capability A; fallback intelligently syncs only A, then `mkdir`/`mv` archives the entire change without rerunning `just archive-change`. Any other delta capability is neither promoted nor guard-checked, so its change is silently discarded with the archived folder.
  fix: After making the named delta guard-safe, return to `just archive-change <change>`; do not manually move the change folder.

EVIDENCE CHECK: No—independently ran `bun test` (167 passed), but it does not execute this prose fallback control flow. All four skills name the guarded default, require the named refusal/capability, twins match, and intelligent-merge instructions remain intact.

VERDICT: BLOCK

## Task 4.2 — Second reviewer output

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—independently ran `bun test` (170 passed), including the 3 archive-skill tests; inspected all four twins and guard semantics. The scoped merge + complete MODIFIED restatement makes the retry guard-safe without sibling mutation; retry remains fail-closed.

VERDICT: PASS

## Task 5.1 — First reviewer output

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Required docs gate is failing—`openspec/changes/add-orchestrator-bookkeeping/tasks.md:5.1`
  scenario: `just docs-lint` exits 1 with 35 errors, not the required clean/PARTIAL result.
  fix: resolve the Markdown errors (including the review log) and rerun the full gate.

- [P1][CONFIRMED] README introduces broken file references—`README.md:49,140,315`
  scenario: users following the install hint look for nonexistent `openspec/applypolicy.config.yaml`; the caveat link targets nonexistent `shaKEDOWN.md`.
  fix: restore `apply-policy.config.yaml` and `SHAKEDOWN.md` spelling/links.

- [P1][CONFIRMED] Close-out docs claim session-path validation the shipped recorder does not perform—`docs/close-out.md:68-72`, `tools/record-verdict.ts:140-145`
  scenario: `just record-verdict add-orchestrator-bookkeeping tools/fixtures/session-with-verdicts.jsonl` accepts a valid relative transcript and appends a verdict, contrary to “relative … path fails.”
  fix: either enforce absolute persisted paths in `record-verdict.ts` or describe this as a protocol requirement rather than a recorder guarantee.

EVIDENCE CHECK: No—the supplied full docs-lint result fails the task’s required gate; targeted lint does not satisfy it.

## Task 5.1 — Second reviewer output

VERDICT: PASS

FINDINGS:
- None.

EVIDENCE CHECK: `just docs-lint` could not be independently run under this reviewer’s enforced read-only gate; its quoted output remains author evidence. Direct inspection confirms narrow generated-ledger exclusions, scoped Vale exceptions, discoverable close-out docs, and claims matching the shipped prompts/tools; `bun test tools/docs-contracts.test.ts` passed (5/5).
