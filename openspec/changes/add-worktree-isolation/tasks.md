# Tasks—add-worktree-isolation

> Enables concurrent pi sessions via git worktrees. The agents are unchanged; the work is
> provisioning the gitignored guards into each worktree, a global fail-closed canary, a lock on the
> shared ledgers, and `openspec` conventions in AGENTS.md. Task 2.1 is a verification gate—the
> global-canary design (D2) depends on its finding; do it before building the canary.

## 1. worktree provisioning (spec: worktree-provisioning)

- [x] 1.1 Add a `just worktree <name>` recipe to `justfile.opsx`: create a sibling linked worktree
      on branch `session/<name>` (`git worktree add ../<repo>--<name> -b session/<name>`), then call
      the guards-only provision step (1.2).
      files: `justfile.opsx`
      probe: `just worktree smoke` creates `../<repo>--smoke` on branch `session/smoke` with a populated `.pi/extensions/`.
      out-of-scope: nesting worktrees inside `.claude/worktrees/`; touching tracked `openspec/`/`tools/`.
      spec: `worktree-provisioning`

- [x] 1.2 Add a guards-only provision step (an `install.sh --guards <path>` mode or a small script)
      that copies only `extensions/*` into `<path>/.pi/extensions/` and is idempotent (converges on
      re-run). It must NOT copy `openspec/`, `tools/`, `schemas/`, or `config.yaml`—git supplies those.
      files: `install.sh` (or `tools/provision-worktree.sh`)
      probe: running it twice against one worktree leaves the guard set present exactly once; tracked paths untouched (`git status` clean for them).
      out-of-scope: the global canary install (task 2.3).
      spec: `worktree-provisioning`

- [x] 1.3 During provisioning, symlink `<path>/memory` to the primary checkout's `memory/` so the
      ledger is shared, not per-worktree.
      files: `install.sh` (or the provision script)
      probe: a file written under the primary `memory/` is readable via the worktree's `memory/` symlink.
      out-of-scope: the locking behaviour (section 3).
      spec: `shared-ledger-locking`

- [x] 1.4 Add `just worktree-rm <name>` that removes a provisioned worktree despite its untracked
      ignored state: remove the worktree's own `.pi/` and `memory` symlink first (or pass
      `git worktree remove --force`), then `git worktree prune`. Must delete only the worktree's
      symlink, never the primary's `memory/` target.
      files: `justfile.opsx`
      probe: `just worktree smoke && just worktree-rm smoke` succeeds end-to-end (plain `git worktree remove` would refuse the provisioned worktree as unclean); the primary `memory/` and object store are intact.
      out-of-scope: deleting the shared `memory/` target (it belongs to the primary).
      spec: `worktree-provisioning`

- [x] 1.5 Add a git-tracked harness marker file at the repo root (for example `.harness-marker`) that the
      global canary keys off (task 2.2). It is tracked, so it is present in every checkout and every
      linked worktree; it must not be gitignored.
      files: `.harness-marker`, `.gitignore` (confirm not excluded), `install.sh` (ship it on `--here`)
      probe: a fresh `git worktree add` (no provisioning) contains `.harness-marker`; an ordinary pi project does not.
      out-of-scope: the canary logic that reads it (2.2).
      spec: `worktree-guard-canary`

## 2. Global guard canary (spec: worktree-guard-canary)

- [x] 2.1 VERIFY-FIRST: confirm whether pi loads extensions from a global path and when that load
      runs relative to per-repo `.pi/extensions/`. Check `pi --help`, the pi docs, and the
      `@mjakl/pi-subagent` install layout. Record the finding in `design.md` Open Question 1.
      files: `openspec/changes/add-worktree-isolation/design.md`
      probe: Open Question 1 is answered with a cited source; the build path (global canary vs. `just preflight` fallback) is chosen.
      out-of-scope: writing the canary before the finding lands.
      spec: `worktree-guard-canary`

- [x] 2.2 Write the global canary extension (pi loader-safe: no regex literals, no raw backticks, no
      apostrophes). Detection MUST key off the tracked `.harness-marker` (task 1.5), never off
      gitignored `.pi/` state. Before evaluating the handshake, the canary, `force-delegate`, and
      `harness-selftest` MUST exempt a delegated child only when trimmed `PI_SUBAGENT_DEPTH` contains
      ASCII decimal digits whose value is a positive safe integer. All other depths are top-level.
      For top-level, update `force-delegate` to set `__FORCE_DELEGATE_LOADED` to
      `String(process.pid)` and require both consumers to accept only exact equality with their own
      `String(process.pid)`; they MUST HALT on a missing, stale, or malformed value. Migrate the
      existing `harness-selftest` consumer to this PID/depth contract.
      files: `extensions/worktree-canary/index.ts`, `extensions/worktree-canary/index.test.ts`,
      `extensions/force-delegate/index.ts`, `extensions/force-delegate/index.test.ts`,
      `extensions/harness-selftest/index.ts`, `extensions/harness-selftest/index.test.ts`
      probe: tests exercise an explicit 28-case Cartesian matrix: each of these exact seven depth
      vectors—`" 9007199254740991 "` (trimmed maximum-safe positive child), unset (environment key
      absent), `"0"`, `"abc"` (malformed), `"-1"` (negative), `"1.5"` (non-integer), and
      `"9007199254740992"` (unsafe integer)—crossed with each of these exact four handshake vectors:
      `String(process.pid)` (current PID), unset (environment key absent),
      `String(process.pid + 1)` (stale well-formed non-current PID), and `"not-a-pid"` (malformed).
      The valid-child depth row stays silent in all four handshake cells before handshake evaluation
      and leaves `force-delegate` inactive. For each of the six top-level depth rows, only the
      current-PID cell stays silent; the missing, stale, and malformed cells each HALT. Separately
      prove a bare marker-bearing worktree HALTs with a provisioning message; a provisioned
      marker-bearing worktree proceeds; a directory without the marker stays silent; and
      `just check-extensions` is clean.
      out-of-scope: the fallback preflight (2.4).
      spec: `worktree-guard-canary`

- [x] 2.3 Install the canary to pi's global extension path from `install.sh` (global mode), and
      extend `just check-extensions` to cover it.
      files: `install.sh`, `justfile.opsx`
      probe: after `./install.sh`, the canary is on the global path and loads in a fresh directory; `just check-extensions` includes it.
      out-of-scope: per-repo `.pi/extensions/` provisioning (task 1.2).
      spec: `worktree-guard-canary`

- [x] 2.4 If task 2.1 finds no global extension support: add a `just preflight` recipe wrapping
      `just check-extensions` and document that it is mandatory at session start; make `just worktree`
      the only blessed creation path. (Skip if 2.1 confirms global support.)
      files: `justfile.opsx`, `README.md`
      probe: `just preflight` fails in a bare worktree and passes in a provisioned one.
      out-of-scope: reimplementing the canary logic (reuse check-extensions).
      spec: `worktree-guard-canary`

## 3. `Sha`red ledger locking (spec: shared-ledger-locking)

- [x] 3.1 Add a dependency-free lock + atomic-write utility (acquire with timeout/stale-break, write
      temp then rename) to `tools/lib/`.
      files: `tools/lib/ledger-lock.ts`
      probe: unit test—the lock serializes two writers and breaks a stale lock after timeout.
      out-of-scope: wiring it into callers (3.2, 3.3).
      spec: `shared-ledger-locking`

- [x] 3.2 Route `tools/trust.ts` read-modify-write through the lock and atomic write.
      files: `tools/trust.ts`, `tools/trust.test.ts`
      probe: FAILING-FIRST—a test that fires two concurrent trust updates asserts both persist; it fails on current `trust.ts` (lost update) and passes after this task (red -> green).
      out-of-scope: the goals writer (3.3).
      spec: `shared-ledger-locking`

- [x] 3.3 Confirm the goals writer needs NO lock. `tools/verify-goals.ts:90-92` writes per-goal
      `goals/<name>.md` (per-worktree files) and APPENDS to `memory/goal-ledger.tsv`—no shared
      whole-file read-modify-write, so there is no lost-update bug to fix. Add a test asserting
      concurrent goal-ledger appends both persist without a lock, and document that the goal ledger
      is deliberately lock-free. (No red->green here—there is no defect; a fabricated failing test
      would be a BLOCK per the reviewer de-bias rule.)
      files: `tools/verify-goals.test.ts`
      probe: two concurrent `verify-goals` runs both land their rows in `memory/goal-ledger.tsv`; no lock import is added to `verify-goals.ts`.
      out-of-scope: changing goal verification logic; adding locking to an append-only path.
      spec: `shared-ledger-locking`

- [x] 3.4 Confirm `extensions/lib/tool-events.ts` stays a plain append and is NOT routed through the
      lock.
      files: `extensions/lib/tool-events.ts`
      probe: the append path is unchanged (`appendFileSync`, no lock import); a test appends from two writers without contention.
      out-of-scope: changing what events are logged.
      spec: `shared-ledger-locking`

## 4. `openspec` + operating conventions (spec: worktree-openspec-conventions)

- [x] 4.1 Add worktree conventions to `templates/AGENTS.md`: one active change per worktree on its own
      branch; `openspec archive` runs on the change branch and lands via PR; two concurrent changes
      touching the same `specs/` capability will collide at merge and must not be parallelized.
      files: `templates/AGENTS.md`
      probe: `AGENTS.md` states all three rules; `just docs-lint` clean.
      out-of-scope: enforcing them in an extension (deliberately a convention).
      spec: `worktree-openspec-conventions`

- [x] 4.2 Document the worktree workflow for the reader in `README.md` and `index.html`: `just worktree`
      / `worktree-rm`, the guards-only provisioning model, the global canary, and the shared-ledger note.
      files: `README.md`, `index.html`
      probe: README has a worktree section covering create/remove, provisioning, and the canary; index.html reflects it; docs gate clean.
      out-of-scope: agent-file docs (agents are unchanged).
      spec: `worktree-openspec-conventions`

## 5. Verify

- [ ] 5.1 Live shakedown, recorded in `shaKEDOWN.md`: create two worktrees via `just worktree`, run a
      guarded session in each on a different change, prove the canary by removing a guard (session
      HALTs), prove concurrent trust writes both persist, and confirm no `openspec` cross-talk between
      the two change folders.
      files: `shaKEDOWN.md`
      probe: the shakedown log shows both sessions guarded, the canary halting on a stripped worktree, both concurrent ledger writes present, and independent `openspec` contexts.
      out-of-scope: automating the shakedown (manual evidence is acceptable here).
      spec: `worktree-provisioning`
