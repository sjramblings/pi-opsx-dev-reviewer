# Review log—add-worktree-isolation

Durable record of every reviewer verdict for this change. The developer appends each verdict block
verbatim before ticking the task. At archive time, `/opsx-retro` reads this file and ratchets
recurring finding classes into lint rules, `openspec/config.yaml` rules, or `AGENTS.md` lines. This
is what stops review findings from evaporating after a single task.

---

<!-- Appended per task, newest last. No tasks implemented yet—this change is a plan for assessment. -->

## Spec review (pre-code red-team)—resolved

Not a per-task apply verdict; recorded here as the spec red-team that gates this change before apply.

VERDICT (incoming): BLOCK—3 findings.

- [P1] Canary keyed off gitignored `.pi/`/local guards could not detect the bare worktree it must
  halt. RES`OL`VED: added a git-tracked `.harness-marker` requirement + task 1.5; canary now keys off
  the tracked marker (worktree-guard-canary spec, task 2.2, design D2).
- [P1] `Sha`red-ledger plan invented a goals lost-update bug; `verify-goals.ts:90-92` only appends to
  `memory/goal-ledger.tsv` + writes per-worktree `goals/*.md`. RES`OL`VED: narrowed the lock to the
  real RMW file `memory/trust.tsv`; task 3.3 reframed to confirm the goals path stays lock-free (no
  fabricated red->green); design D3 corrected.
- [P1] `worktree-rm` underspecified for the untracked ignored state provisioning creates. RES`OL`VED:
  removal path now removes `.pi/`/symlink first or uses `--force` then prune, deleting only the
  worktree's own symlink (worktree-provisioning spec, task 1.4).

EVIDENCE CHECK: `openspec validate --strict` passes; goals-writer claim verified against
`tools/verify-goals.ts:90-92` (append + per-goal file, no shared RMW). Behavioural claims remain
unproven until implemented—task 5.1 shakedown is the live evidence gate.

VERDICT: PASS
FINDINGS (most severe first):
- None.

EVIDENCE CHECK: No—live `just worktree smoke` cannot pass until pending task 1.2 adds `--guards`; the supplied hermetic real-git transcript covers task 1.1’s branch, sibling path, and provision-call interface, while the reviewed hunk matches the contract.

VERDICT: PASS
FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—hermetic real-git probe exercises two runs and verifies extension equality plus untouched tracked paths. Independent inspection confirms `install.sh:81-95` only creates `.pi/extensions` and copies `extensions/*`; `git diff --check` and `just probe-check add-worktree-isolation` pass. `just verify-gate` is partial (missing tools).

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—the hermetic real-git probe meaningfully covers sharing, rerun idempotence, directory/file conflicts, and primary refusal. Independent inspection confirms porcelain first-entry parsing is appropriate for Git’s primary worktree, canonical symlink comparisons prevent replacement of conflicting links, and `bun test` passes (453).

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—verified hermetic real-Git probe covers successful removal, refusal cases, primary-memory/object survival, and prune; independent `bun test` passed (468) and `just probe-check add-worktree-isolation` passed. `just verify-gate` remains PARTIAL (three unavailable checks).

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Marker is not git-tracked—`.harness-marker:1`
  scenario: Running `git worktree add` from the current checkout checks out `HEAD`, which excludes the untracked marker; the fresh worktree has no marker, so the later canary cannot identify and halt an unprovisioned harness worktree.
  fix: Add `.harness-marker` to Git (and commit it with the delivered change) before completing task 1.5. Actual `git status --short .harness-marker` reports `?? .harness-marker`.

EVIDENCE CHECK: No—the claimed hermetic committed-fixture probe does not establish the delivered repository marker is tracked; independent status proves it is currently untracked. `bun test` passes (468), while `just verify-gate` is PARTIAL.

VERDICT: PASS

FINDINGS (most severe first):
- None. The prior P1 incorrectly required an index/commit mutation during pre-commit review. The retained new-file patch adds `.harness-marker`; once applied and committed, Git propagates it to linked worktrees as required.

EVIDENCE CHECK: Yes—actual marker, installer logic, `.gitignore`, and retained real-Git artifact `/tmp/pi-opsx-task-1.5-evidence.Om0o0b/worktree-transcript.txt` verify patch application, tracked commit, bare-worktree propagation, and absence in an ordinary project; independent `bun test` passed (468) and `just probe-check add-worktree-isolation` passed.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] D2’s handshake premise excludes delegated processes—`design.md:131-135`, `extensions/force-delegate/index.ts:187-193`
  scenario: `@mjakl/pi-subagent` launches a child with `PI_SUBAGENT_DEPTH=1`. `force-delegate` returns before setting `__FORCE_DELEGATE_LOADED`; a global canary in that provisioned marker-bearing worktree then sees an unset handshake at `session_start` and HALTs. This breaks the required “provisioned worktree proceeds” path for developer/reviewer subagents.
  fix: Define and test delegated-process behavior before choosing D2—either set a load handshake before the child early-return, or explicitly exempt child processes and revise the canary contract accordingly.

EVIDENCE CHECK: No—the retained RPC probe proves top-level factory/event ordering only; it does not run with `PI_SUBAGENT_DEPTH=1` or verify the handshake. `bun test` passes (468); `just verify-gate` remains PARTIAL.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] The child “unset handshake” contract and its proof are false—`design.md:153`, `spec.md:27-31`.
  scenario: A top-level `force-delegate` sets `__FORCE_DELEGATE_LOADED=1` (`extensions/force-delegate/index.ts:189-193`); the real subagent runner copies `...process.env` into its child (`@mjakl/pi-subagent/runner.ts:287-288`). The depth-1 child therefore inherits handshake `1`; its early return does not clear it. The cited probe explicitly deletes that environment variable before directly injecting depth (`run-probe.py:18-22`), so it cannot establish the claimed real-child observation.
  fix: Align `force-delegate` child classification with the documented strict positive-safe-integer parser and clear the inherited handshake in valid children, or remove the “without a false handshake/unset” contract. Replace the direct-depth probe with a real `@mjakl`-spawned child probe that preserves inherited environment and retains its streams.

EVIDENCE CHECK: No—the retained RPC probe proves direct `PI_SUBAGENT_DEPTH=1` behavior only; it explicitly suppresses the inherited-handshake path required by the stated contract.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Task 2.2 still specifies the obsolete set/unset handshake contract—`openspec/changes/add-worktree-isolation/tasks.md:60-67`
  scenario: A top-level marker-bearing process inherits stale `__FORCE_DELEGATE_LOADED=1` (or any non-current PID). The task says to HALT only when unset and “stay silent otherwise,” so a task-compliant canary proceeds. The normative spec requires exact current-PID equality and a halt for stale/malformed values (`specs/worktree-guard-canary/spec.md:10-19`).
  fix: Update task 2.2’s behavior, file surface, and probe to require the full 14-case PID/depth matrix; include `force-delegate`, `harness-selftest`, and tests as required by `design.md:171-182`.

EVIDENCE CHECK: No—the retained PID-inheritance artifact and independent docs/source inspection support D2, but the executable task/probe remains on the superseded contract. `openspec validate`, `probe-check`, and current force-delegate tests pass without exercising the required canary matrix.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] PID/depth matrix count contradicts its required combinations—`openspec/changes/add-worktree-isolation/tasks.md:72`
  scenario: Seven depth classes crossed with exact PID plus missing, stale, and malformed handshake forms is 7×4=28 input combinations, not 14. An implementer honoring “14-case” can test only one non-current form per depth, leaving stale or malformed top-level handling unproven despite the spec requiring both to HALT.
  fix: Require at least 28 explicitly enumerated depth/handshake combinations (and name the vectors), rather than a “14-case” matrix.

EVIDENCE CHECK: No—the supplied structural checks pass (independently reran `openspec validate ... --strict` and `just probe-check ...`), and installed pi docs/source support the chosen global-extension/session-start path, but they cannot resolve the contradictory matrix acceptance criterion.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Proposal contradicts the settled lock scope—`openspec/changes/add-worktree-isolation/proposal.md:16,46,53`
  scenario: An implementer following the proposal routes `tools/verify-goals.ts` through the lock because it calls the goals ledger a whole-file RMW writer. This violates `tasks.md:117-125` and `specs/shared-ledger-locking/spec.md:29-39`, which require goal-ledger appends to remain lock-free.
  fix: Update the proposal to say only `tools/trust.ts` receives locking/atomic write; goal and tool-event writers remain plain appends.

EVIDENCE CHECK: No—the supplied validation and probe-presence checks do not detect this cross-artifact contract contradiction; independent inspection confirmed it.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—`design.md` answers D2 with cited Pi extension-location/lifecycle evidence, retained live ordering probe, and installed `pi-subagent` layout/depth evidence. Independent inspection confirmed the documented global paths, factory-before-`session_start` guarantee, strict depth parser, and PID inheritance scenario. `bun test` passed (468); `just probe-check add-worktree-isolation` passed. Lock scope is consistent: only `tools/trust.ts` is whole-file RMW; goals and tool events remain append-only.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Task 2.2 weakens the main-agent mutation boundary outside its PID/depth contract—`extensions/force-delegate/index.ts:52,172-180`
  scenario: A top-level main agent invokes `just archive-change add-worktree-isolation`. The new allowlist admits it, and `justfile.opsx:211-239` runs `openspec archive` and `markdownlint --fix`, mutating the checkout directly. The prior policy blocked all mutating bash.
  fix: Revert the new `just` writer/reader allowlists and their tests from task 2.2; retain only strict child parsing and the PID handshake changes.

EVIDENCE CHECK: No—the targeted Bun tests passed (36) and `just probe-check` passed, but the real-pi transcript only shows a banner/PID state and processes `get_state` after the bare-marker halt; input/tool blocking is covered only by mocked handlers, not a live tool/input rejection.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Canary leaves direct user/RPC shell execution open after HALT—`extensions/worktree-canary/index.ts:80-90`
  scenario: In a bare marker-bearing RPC session, `session_start` requests shutdown, but Pi services the first queued command before its deferred shutdown check. A client sends `{"type":"bash","command":"touch unsafe"}`; Pi dispatches `user_bash` and executes it, while the canary only handles `input` and `tool_call`. The retained idle artifact confirms the process remains alive awaiting a command.
  fix: Register a `user_bash` handler that, when halted, returns a cancelled non-executing result; add a real-RPC first-command `bash` probe proving no sentinel is created. This also covers interactive `!` commands.

EVIDENCE CHECK: No—the retained runner evidence and independently rerun 36 focused / 480 full tests prove prompt handling and model-tool blocking, but do not test direct RPC bash; installed Pi source confirms `rpc-mode.js:437-450` executes it before `rpc-mode.js:630` checks deferred shutdown.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Deferred shutdown still permits RPC file writes—`extensions/worktree-canary/index.ts:80-84`, `extensions/harness-selftest/index.ts:79-83`
  scenario: In a halted marker-bearing RPC session with an existing session file, send first command `{"type":"export_html","outputPath":"unsafe.html"}`. Pi RPC executes `session.exportToHtml()` before checking the deferred shutdown request; it writes `unsafe.html` via `writeFileSync`. `input`, `tool_call`, and `user_bash` do not intercept this control command.
  fix: Make the halted path terminate synchronously/fail closed before RPC accepts a command (with a child-process regression probe covering `export_html`), since no generic RPC-command interceptor exists.

EVIDENCE CHECK: No—the independent full suite passed (481), and the retained RPC artifact proves `user_bash` cancellation, but neither covers the directly writable `export_html` RPC path.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Tracked-marker requirement is not met—`.harness-marker:1`
  scenario: `git show HEAD:.harness-marker` fails and `git status --short` reports `?? .harness-marker`; a fresh linked worktree from the current change therefore lacks the marker. `extensions/worktree-canary/index.ts:67` returns silently, leaving its unguarded top-level session unhalted.
  fix: Include `.harness-marker` as a tracked file in the change/commit.

EVIDENCE CHECK: No for full task conformance—the retained child artifact and independently rerun 482 tests prove synchronous exit/no first mutation for manually created markers, but not that the marker ships in a fresh worktree.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—independently reran task-2.2 targeted tests (38 passed) and `just probe-check add-worktree-isolation` (passed); code implements the strict 28-cell depth/PID contract and marker-only detection. The supplied combined-fixture stream remains uncited transient evidence, but no new P0/P1 is established.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Reinstall does not converge stale local canaries to global-only—`install.sh:164-169`, `install.sh:349-354`
  scenario: A repo/worktree provisioned before this change has `.pi/extensions/worktree-canary/`. Re-running `--guards` or `--here` skips copying it but never removes it, leaving a local canary despite the global-only contract; a stale load-breaker also makes `check-extensions` fail after reprovisioning.
  fix: Detect and safely remove/refuse the pre-existing local `worktree-canary` entry during project/guards provisioning so the resulting local extension set excludes it.

EVIDENCE CHECK: No—`bun test` independently passed (482) and `just probe-check add-worktree-isolation` passed, but neither tests installer upgrade convergence or global auto-discovery; the claimed fresh-runtime transcript is not retained/cited in the change ledger. `just verify-gate` is PARTIAL (eslint/semgrep unavailable).

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Cleanup can delete outside the target through a symlinked parent path—`install.sh:24-61`
  scenario: `<target>/.pi/extensions` is a symlink to another directory containing a regular `worktree-canary/index.ts`. The leaf is not itself a symlink, so validation passes and `rm "$CANARY_DIR/index.ts"` deletes the external file. A concurrent replacement of the validated canary directory with a symlink has the same effect.
  fix: Refuse symlinks/non-directories in parent components before cleanup and use descriptor-based/no-follow deletion (or decline automatic deletion) so validation cannot be invalidated before mutation. Add a parent-symlink and race regression probe.

EVIDENCE CHECK: No—independently reran `bun test tools/install-canary-upgrade.test.ts` (12 pass), `bun test` (494 pass), and `just probe-check add-worktree-isolation` (pass), but the new test covers only leaf symlinks/static unsafe entries, not symlinked parents or TOCTOU. `tsc --noEmit` exited 1 (no tsconfig present), so “tsc clean” is not reproducible.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: No—independently reran `bun test tools/install-canary-upgrade.test.ts` (22 passed) and `bun test` (504 passed). The committed focused test covers local refusal/convergence only; the claimed global fresh-pi/load proof is not retained or independently reproducible. Static inspection confirms `prepare_local_extensions_dir` runs before guards-memory (`install.sh:182`) and project-marker (`install.sh:374`) effects, performs no deletion, and both local copy loops exclude `worktree-canary`; global installation copies and `cmp`s the global canary, while `check-extensions` includes it when installed.

VERDICT: PASS

FINDINGS:
- None.

EVIDENCE CHECK: No—the skip condition is independently confirmed: Pi’s installed extension docs list `~/.pi/agent/extensions/*/index.ts` auto-discovery, and `design.md:117-190` selects D2; `tasks.md:52-98` correctly leaves conditional 2.4 unchecked. `README.md` and `justfile.opsx` contain no `preflight` fallback. However, the claimed pre/post no-op hashes are not retained, and the current repository diff is already broad, so task-level no-write attribution cannot be independently reconstructed. `just probe-check add-worktree-isolation` passed; `just verify-gate` was PARTIAL due to unavailable tools.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Live owners are stolen after `staleMs`—`tools/lib/ledger-lock.ts:367`
  scenario: A synchronous callback holds the default lock longer than 30s; B sees the unchanged owner mtime as stale, removes it, and both write concurrently. The existing stale-takeover test itself keeps `oldOwner` alive while the child takes it over.
  fix: Break only demonstrably dead owners (for example, validate owner PID liveness) or implement a safe lease/heartbeat; add an active-long-owner regression.

- [P1][CONFIRMED] Concurrent stale breakers can remove a newly acquired lock from an ownerless stale directory—`tools/lib/ledger-lock.ts:217-239`
  scenario: A and B both observe an empty stale lock. A renames/removes it and reacquires a new populated lock. B resumes and blindly renames that replacement lock, then fails `rmdir` because it is nonempty. A later releases against the now-missing original path, leaving B’s quarantined lock and allowing a third writer to acquire the original path concurrently with A.
  fix: Atomically claim an ownerless lock before quarantining it, then verify that claim before removal; add a two-breaker/reacquisition regression.

- [P1][CONFIRMED] `withLedgerLock` silently releases before an async callback completes—`tools/lib/ledger-lock.ts:379-401`
  scenario: `await withLedgerLock(path, async () => { await gate; write(); })` returns the Promise from `run()` and immediately calls `release()`. Another writer acquires while the callback is pending, defeating serialization.
  fix: Reject Promise/thenable callback results for this synchronous API (after release), or provide a separate async lock wrapper that releases only after settlement; add a regression.

EVIDENCE CHECK: No—the focused suite (9) and full suite (513) independently pass, but the claimed child transcripts have no retained cited path and tests do not cover these failure scenarios. `probe-check` passes; `verify-gate` is PARTIAL.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Crashes during lock initialization leave a permanently unrecoverable lock—`tools/lib/ledger-lock.ts:266-285,350-383,420-444`
  scenario: A writer is killed after creating `stale-break.claim` but before removing it. After `staleMs`, every later writer sees the ownerless directory, attempts `O_EXCL` claim creation, gets `EEXIST`, returns `false`, and eventually times out; the abandoned claim is never recoverable. A crash during owner write instead makes stale parsing throw, and a crash after valid owner creation but before claim removal makes stale-owner `rmdirSync` fail on the retained claim.
  fix: Make every initialization state recoverable: safely reclaim/quarantine aged abandoned claims (with identity/revalidation), including claim-plus-owner and partial-owner states, and add real-process SIGKILL regressions for each installation phase.

EVIDENCE CHECK: No—independently reran `bun test tools/lib/ledger-lock.test.ts` (14 pass) and `bun test` (518 pass), but tests cover only an empty ownerless directory, not abandoned claims or partial owner initialization.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—independently ran `bun test` (525 passed), `bun test tools/lib/ledger-lock.test.ts --rerun-each 3` (63 passed), `tsc --noEmit` (clean), and `just probe-check add-worktree-isolation` (passed). `just verify-gate` remains PARTIAL because eslint/semgrep/tsconfig are unavailable, not due to this utility.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes—independently ran `bun test tools/trust.test.ts` (10 pass), repeated it 3× (30 pass), `bun test tools/lib/ledger-lock.test.ts` (21 pass), full `bun test` (529 pass), and `just probe-check add-worktree-isolation` (pass). `trust.ts:86-90` locks load/apply/atomic rename; tests cover distinct and same-skill concurrent CLI updates, symlinked memory, cleanup/release, and installed CLI/import. `verify-goals.ts` and `extensions/lib/tool-events.ts` retain plain appends/no lock import; the existing `tool-events` diff is not attributed to task 3.2. `tsc --noEmit` is not independently reproducible as green because the repo has no `tsconfig.json`; `just verify-gate` reports PARTIAL for that and unavailable eslint/semgrep.

VERDICT: PASS

FINDINGS:
- None.

EVIDENCE CHECK: Yes for task behavior—independently ran `bun test tools/verify-goals.test.ts` (7 passed) and `bun test` (531 passed); inspected retained child transcripts and shared-ledger artifact. `tsc --noEmit` is not valid evidence here: it exits 1 because TypeScript is not installed.

VERDICT: PASS

FINDINGS:
- [P2][CONFIRMED] Verification claim mismatch—`tsc --noEmit` exits 1 because TypeScript is not installed; its output explicitly says it is not the TypeScript compiler. This does not block the task because the focused Bun runtime test passes.  
  fix: install/use the project TypeScript compiler before claiming strict typecheck coverage.

EVIDENCE CHECK: Yes for task behavior: `bun test extensions/lib/tool-events.test.ts` independently passed (6/6); retained `/tmp/pi-opsx-task-3.4-evidence` transcripts show three two-process shared-symlink rounds with valid two-row ledgers. The claimed strict `tsc` success did not reproduce.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: No—the supplied “full docs-lint exit1” claim did not reproduce: `just docs-lint` exited 0 (Vale warnings only). Independently, `bun test tools/docs-contracts.test.ts tools/docs-lint-readonly.test.ts` passed 49 tests. `templates/AGENTS.md:19-23` clearly states all three required conventions, explicitly names `openspec/specs/<capability>` and delta promotion collisions; it is 53 lines. The template is intentionally fresh-install-only (`install.sh` uses `cp -n`), consistent with the task’s template-only scope and the root AGENTS global-invariants role.

VERDICT: BLOCK

FINDINGS (most severe first):
- [P1][CONFIRMED] Stale raw archival command remains in the installed conventions—`templates/AGENTS.md:22`
  scenario: A newly installed project follows `openspec archive` directly, bypassing `just archive-change`’s ledger, promotion, and documentation gates.
  fix: Replace the raw command convention with guarded `just archive-change <change>` on the owning branch; do not retain the raw command text. This is the cause of the lifecycle-contract failure defined at `tools/next-lifecycle.test.ts:24-28,102-121`.

EVIDENCE CHECK: README and HTML cover create/remove, primary/global setup, guards-only provisioning, marker/PID canary behavior, stale-local refusal, shared-ledger distinctions, and guarded close-out consistently. Independently, `bun test` reported 532 passed; `bun test` docs-contract tests reported 49 passed; `just probe-check add-worktree-isolation` passed; `just verify-gate` was PARTIAL. The supplied failing `docs-lint` result was not independently runnable under reviewer constraints; if `just docs-lint` exits nonzero, it blocks task 4.2 by its explicit probe regardless of whether violations predate this section.

VERDICT: PASS

FINDINGS (most severe first):
- None.

EVIDENCE CHECK: Yes for task 4.2: README.md:178 and index.html:344 document creation/removal, guards-only provisioning, global canary, and shared ledgers. `templates/AGENTS.md:22` now requires guarded on-owning-branch archive via PR. Raw `openspec archive` appears only as prohibition (README.md:241; index.html:394) or OpenSpec-behaviour explanation (README.md:466), not guidance. Independently ran `just probe-check add-worktree-isolation` (pass), focused docs tests (49 pass), and `bun test` (533 pass). `just docs-lint` still emits broad existing diagnostics outside this task’s worktree section; no P0/P1 is attributable to task 4.2.
