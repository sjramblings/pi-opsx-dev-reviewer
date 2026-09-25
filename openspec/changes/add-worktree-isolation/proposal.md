# Concurrent pi sessions via git worktrees

## Why

The harness assumes one checkout: one working directory, one branch, one change in
flight. To run several pi sessions against the same repo at once, each needs its own
checked-out branch—which is exactly what a git worktree gives (its own directory and
branch over one shared object store). But three things break if worktrees are used naively:

- **The guards do not travel.** Every structural guard lives in `.pi/extensions/`, which is
  gitignored. `git worktree add` checks out tracked files only, so a fresh worktree loads
  *zero* guards—the read-only main agent becomes write-capable and `branch-guard` is gone.
- **The failure is silent.** `harness-selftest`, the canary meant to HALT when `force-delegate`
  did not load, lives in that same gitignored `.pi/extensions/`—so in a bare worktree the
  canary is also absent and never fires. An unguarded session looks identical to a guarded one.
- **The shared trust ledger races.** `tools/trust.ts` reads, modifies, and rewrites the whole
  `memory/trust.tsv`, so two concurrent sessions writing at once can lose updates. The goals
  writer only appends to its shared ledger and writes per-worktree goal files, so it has no
  corresponding lost-update defect.

`openspec` itself needs no change: all of `openspec/` is git-tracked and the CLI is cwd-relative,
so each worktree gets its own change/spec/schema context for free. The work is provisioning the
gitignored harness state, making the canary fire from outside the repo, and making the shared
trust ledger concurrency-safe while leaving append-only writers lock-free.

## What Changes

- A `just worktree <name>` recipe becomes the only sanctioned way to spin one up: it creates a
  linked worktree on a new feature branch, then provisions **only** the gitignored guard state
  into it (`.pi/extensions/`), relying on the git checkout for the tracked `openspec/`, `tools/`,
  `schemas/`, and `config.yaml`.
- A **global** guard canary—installed to pi's global extension path, not the repo's gitignored
  `.pi/extensions/`—HALTs loudly when a top-level harness session lacks an active `force-delegate`,
  verified by a current-PID handshake. Delegated child processes are exempt so they retain
  their full tools; a bare or unprovisioned top-level worktree cannot run unguarded.
- The learning ledgers (`memory/`) are **shared** across worktrees via a symlink to the primary.
  Only the whole-file trust writer gains a **lock** and atomic write; goal-ledger and
  `tool-events.jsonl` writers remain plain, lock-free appends.
- The `openspec` operating conventions are written into `AGENTS.md` so every session honours them:
  one active change per worktree, archive on the change's own branch via PR, and avoid concurrent
  changes that promote deltas into the same `specs/` capability.

## Capabilities

### New Capabilities

- `worktree-provisioning`: a single recipe creates a worktree and provisions the gitignored guards into it
- `worktree-guard-canary`: a global, fail-closed canary that halts marker-bearing top-level sessions whose guards did not load, while exempting delegated children
- `shared-ledger-locking`: the whole-file trust writer serializes atomic updates while goal-ledger and tool-event appends stay lock-free
- `worktree-openspec-conventions`: AGENTS.md conventions that keep concurrent `openspec` changes from colliding

## Impact

New recipe in `justfile.opsx` (worktree, `worktree-rm`); a new global extension plus an
`install.sh` step to place it on the global pi path and a guards-only provisioning path; a lock
utility in `tools/lib/` routed only into `tools/trust.ts`; tests confirm concurrent trust updates
persist while goal-ledger and tool-event writers stay lock-free, with no production edit to the
existing goals writer. Conventions are added to `templates/AGENTS.md`, with the workflow documented
in `README.md` and `index.html`.

No change to the six agent files—they are already installed globally and operate cwd-relative,
so they support worktrees unchanged. No new runtime dependency. The single-checkout workflow is
unaffected; worktrees are opt-in via the recipe.
