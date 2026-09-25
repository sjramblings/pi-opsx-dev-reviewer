# Design—add-worktree-isolation

## Context

pi has no built-in concurrency model; each session is a process rooted at a working directory.
Running several sessions against one checkout collides on the single checked-out branch and on the
working tree. Git worktrees are the native fit: `git worktree add` gives each session its own
directory and branch over one shared `.git` object store.

Three parts of this harness assume a single checkout and break under naive worktree use:

1. The structural guards live in `.pi/extensions/`, which `.gitignore` excludes. `git worktree add`
   materialises tracked files only, so a fresh worktree has no guards.
2. `harness-selftest`—the canary that HALTs when `force-delegate` did not load—lives in that
   same gitignored directory, so it too is absent in a bare worktree and cannot fire. The unguarded
   state is therefore silent, which is precisely the manufactured-rigor failure class the kit
   already treats as its nemesis (see `shaKEDOWN.md`, `docs/operating-risks.html`).
3. `tools/trust.ts` reads the whole ledger, mutates it, and writes it back. Two concurrent sessions
   sharing that ledger lose updates.

Already-verified non-problems: the six agents install globally to `~/.pi/agent/agents/`, so every
worktree sees them; `architect-scope` and the other guards gate on `process.cwd()`-relative paths,
correct per worktree; `branch-guard` already reads the `.git`-as-a-file worktree pointer; and all
of `openspec/` is git-tracked and the openspec CLI is cwd-relative, so `openspec` context travels
into each worktree for free.

## Goals / Non-Goals

**Goals:**

- One command to create a worktree that is fully guarded from its first session.
- A guard-absence failure that is loud and impossible to miss, from outside the repo.
- `Sha`red learnings/goals/trust across concurrent sessions, with no lost updates.
- `openspec` conventions that keep concurrent changes from colliding at merge.

**Non-Goals:**

- Changing the six agent definitions (they already support worktrees unchanged).
- Enforcing one-change-per-worktree in code—git surfaces the conflict; a convention suffices.
- Any change to `openspec` itself or its CLI.
- Cross-machine or cross-user concurrency; this is one operator, one machine, many local sessions.

## Decisions

- **D1—Guards-only provisioning, not full `install.sh --here`.** `--here` re-copies tracked paths
  (`openspec/`, `tools/`, `schemas/`) and could overwrite the tracked `dev-reviewer` schema with the
  kit's copy. A worktree already has those from git, so provisioning copies only the gitignored
  `.pi/extensions/` (and symlinks `memory/`). *Alternative rejected:* reuse `--here` wholesale—
  redundant and clobber-prone.

- **D2—A global, top-level canary keyed off a tracked marker, per the operator's decision.** The
  canary is installed to pi's global extension path so it loads in every working directory including
  an unprovisioned worktree. At `session_start`, it requires a process-bound handshake:
  top-level `force-delegate` sets `__FORCE_DELEGATE_LOADED` to `String(process.pid)`, and the canary
  accepts only exact equality with its own `String(process.pid)`. A parent PID inherited by a nested
  pi process is stale and cannot prove that `force-delegate` loaded in that process. Delegated child
  processes are intentionally exempt before handshake evaluation: both extensions classify a child
  only when trimmed `PI_SUBAGENT_DEPTH` is an ASCII decimal digit sequence whose numeric value is a
  positive safe integer. `force-delegate` remains inactive there so the child retains full tools;
  the canary stays silent regardless of whether the child inherited a handshake value. An unset,
  zero, malformed, negative, non-integer, or unsafe-integer depth is top-level. In that case
  `force-delegate` activates and replaces any inherited handshake with its own PID; the canary HALTs
  if the resulting value is missing, stale, or otherwise not its exact PID. Crucially, the canary
  must recognise a *bare* worktree as a harness repo—but a bare worktree has no `.pi/` (gitignored,
  unprovisioned), so detection CANNOT key off `.pi/` or the local guard set. It keys off a
  git-**tracked** `.harness-marker` at the repo root, which is present in every checkout and every
  linked worktree because it is tracked, and absent from ordinary pi projects. *Alternatives
  rejected:* rely on in-repo `harness-selftest` (cannot fire when absent—the core bug); detect via
  `.pi/` (absent in the exact case that must halt—the finding-1 defect); clear or require an unset
  child handshake (environment inheritance makes absence false evidence, and child exemption makes
  its value irrelevant); accept a constant handshake (a nested process can inherit it); a manual
  `just preflight` (depends on the operator remembering). **This hinges on pi supporting a global
  extension load path; Open Question 1 and task 2.1 confirm it before anything else is built.**

- **D3—`Sha`re `memory/` by symlink; lock only the whole-file read-modify-write ledger; leave appends
  alone.** A symlink to the primary keeps one ledger so back-pressure compounds. The ONLY current
  shared whole-file read-modify-write is `tools/trust.ts` over `memory/trust.tsv`—it gets the lock
  and atomic temp-then-rename write. The goals writer (`tools/verify-goals.ts:90-92`) is NOT a shared
  RMW: it writes per-goal `goals/<name>.md` (per-worktree) and APPENDS to `memory/goal-ledger.tsv`,
  so it needs no lock and inventing a lost-update bug there would be fabricated rigor. `tool-events.jsonl`
  likewise stays a plain `appendFileSync`. *Alternative rejected:* per-worktree `memory/` folded at
  merge—fragments learnings during the session, defeating the point of a shared ledger.

- **D4—`openspec` conventions live in `AGENTS.md`, not in an extension.** One-change-per-worktree,
  archive-on-branch-via-PR, and the overlapping-capability warning are operating rules; git already
  makes a violation surface as a merge conflict. *Alternative rejected:* an extension that blocks a
  second worktree from touching an in-flight change—over-engineering for a hazard git already shows.

- **D5—`worktrees` are siblings, not nested.** Create them beside the repo (for example `../<repo>--<name>`)
  rather than inside the gitignored `.claude/worktrees/`, which nests a worktree inside the primary
  tree and muddies status. The existing empty `.claude/worktrees/` is not used.

## Risks / Trade-offs

- [Risk] **pi may not support a global extension load path.** → Mitigation: task 2.1 confirms it
  against pi docs before building the canary; if unsupported, ship the documented `just preflight`
  fallback (wrapping `just check-extensions`) that every session must run first, and make worktree
  the only blessed creation path so provisioning is never skipped.
- [Risk] **Canary load order**—the global canary must run after local extensions load, or the
  handshake env var reads unset and it false-halts. → Mitigation: gate the check on a session-ready
  hook, mirroring how `harness-selftest` already sequences the same handshake.
- [Risk] **A corrupt shared ledger hits every session** because `memory/` is symlinked. → Mitigation:
  atomic temp-then-rename writes under the lock; a partial write never replaces the good file.
- [Risk] **Stale lock after a crash** deadlocks the ledger. → Mitigation: a timeout / stale-break on
  lock acquisition (scenario in `shared-ledger-locking`).

## Architecture impact

Alters arc42 **§6 Runtime View** (concurrent sessions become a supported runtime mode), **§7
Deployment View** (worktree layout plus the split between globally installed and per-repo-provisioned
extensions), and **§8 Crosscutting Concepts** (guard loading and ledger concurrency). The
architecture-writer should refresh those three sections at archive; §5 Building Block View gains the
canary and lock utility as components.

## Open Questions

1. **Resolved for pi 0.83.0: yes; choose D2 (global canary), not the `just preflight`
   fallback.** The installed binary reports `pi --version` as `0.83.0`. Its complete Extensions
   guide, **Extension Locations**, explicitly auto-discovers user extensions from
   `~/.pi/agent/extensions/*.ts` and `~/.pi/agent/extensions/*/index.ts`, alongside the project
   equivalents under `.pi/extensions/`
   (`~/.nvm/versions/node/v24.16.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`,
   **Extension Locations**). `pi --help` independently exposes `--extension` and
   `--no-extensions`, but does not state the auto-discovery directories, so the help text alone is
   not the location contract.

   Discovery/import chronology and lifecycle-handler order are distinct. Before an unresolved
   project trust decision, pi loads only user/global and CLI extensions; project-local extensions
   load after trust (the same guide, **Startup Events / project_trust**, and the installed package
   `README.md`, **Settings / Project Trust**). Thus a global factory can run before a local factory
   on that bootstrap path; no design may assume a universal local-before-global import order. For
   the final trusted extension set, the 0.83.0 implementation ranks project auto-discovered
   resources ahead of user auto-discovered resources, reconstructs the final extension array in
   that ranked path order even when global extensions were preloaded for trust, awaits every
   extension factory, and emits events by iterating that final array
   (`dist/core/package-manager.js`, `resourcePrecedenceRank` and
   `addAutoDiscoveredResources`; `dist/core/resource-loader.js`,
   `loadFinalExtensionSet`; `dist/core/extensions/loader.js`, `loadExtension` and
   `loadExtensionsInternal`; `dist/core/extensions/runner.js`, `ExtensionRunner.emit`). Therefore
   project `session_start` handlers execute before user/global `session_start` handlers in this
   version. More importantly for the handshake, the Extensions guide, **Writing an Extension**,
   guarantees that async factories finish before `session_start`. Task 2.2 will make
   `extensions/force-delegate/index.ts` set `__FORCE_DELEGATE_LOADED = String(process.pid)`
   synchronously in its factory for top-level classification. A global canary that only checks from
   `session_start` consequently runs after local `force-delegate` initialization, regardless of
   which factory was imported first; it must not check at module import or factory time.

   Delegation is a separate process contract, not a load-order case. Installed
   `@mjakl/pi-subagent` 2.1.0 documents `PI_SUBAGENT_DEPTH > 0` as the integration signal for a
   delegated process (`~/.pi/agent/npm/node_modules/@mjakl/pi-subagent/README.md:75-77`). Its runner
   computes the next depth and exports it in the spawned pi environment
   (`runner.ts:277-293`, `nextDepth` and `SUBAGENT_DEPTH_ENV`). Its parser accepts only a trimmed
   non-negative safe integer and falls back to depth zero after warning on malformed input
   (`index.ts:142-147` and `index.ts:211-219`, `parseNonNegativeInt`). Current `force-delegate`
   returns on `Number(PI_SUBAGENT_DEPTH) > 0` before registering its tool guard and otherwise sets
   the constant handshake `1` (`extensions/force-delegate/index.ts:187-195`). Task 2.2 must replace
   both behaviors: use the package-aligned strict child classification (trim, decimal digits only,
   safe integer, greater than zero), and set the top-level handshake to `String(process.pid)`.
   Valid children return before handshake evaluation or mutation and retain full tools regardless
   of an inherited value; malformed values classify top-level and must not trigger that early
   return.

   This developer is itself a real depth-1 process spawned by `@mjakl/pi-subagent`, whose runner
   spreads `process.env` into the child environment. The named-environment probe retained at
   `/tmp/pi-worktree-task-2.1-second-rework-process-evidence.txt` records
   `PI_SUBAGENT_DEPTH=1`, inherited `__FORCE_DELEGATE_LOADED=1`, developer pi PID `42406`, and parent
   PID `63332`; the inherited value does not equal this process PID. This disproves the former
   child-handshake-unset claim and demonstrates why a constant inherited handshake is not
   process-bound. No unrelated environment values were captured.

   Task 2.2 shall implement this exact `session_start` decision sequence: no marker → silent;
   marker plus a valid positive-safe-integer child depth → silent before reading the handshake,
   whether the value is missing, current, stale, or malformed; marker plus top-level classification
   and handshake exactly equal to `String(process.pid)` → silent; marker plus top-level
   classification and a missing, stale, or malformed handshake → HALT. An unset, zero, malformed,
   negative, non-integer, or unsafe-integer depth is top-level.

   Because the process-bound contract changes both producer and existing consumer, task 2.2's
   implementation surface explicitly includes `extensions/worktree-canary/index.ts` and its tests,
   `extensions/force-delegate/index.ts` and its tests, and the existing
   `extensions/harness-selftest/index.ts` consumer plus its tests. The two consumers must require
   exact current-PID equality for top-level classification, and `force-delegate` and both consumers
   must apply the same strict child-depth contract. This is task 2.2 work; task 2.1 changes no
   production extension.

   `@mjakl/pi-subagent` also confirms the separate global-package route rather than changing the
   canary destination: `pi list` resolves it to
   `~/.pi/agent/npm/node_modules/@mjakl/pi-subagent`; installed
   `package.json` version `2.1.0` declares `pi.extensions: ["./index.ts"]`, matching
   `docs/packages.md`, **Package Sources / npm**, which places user npm packages under
   `~/.pi/agent/npm/`. The canary shall use the documented direct global extension directory
   `~/.pi/agent/extensions/`, then tasks 2.2 and 2.3 proceed and fallback task 2.4 is skipped. This
   finding establishes startup sequencing and the delegated-process exemption only; it does not
   claim unspecified ordering between unrelated hooks or that mere file discovery proves the
   handshake.

2. Lock mechanism: a maintained `proper-lockfile`-style dependency, native `flock`, or a dependency-
   free `mkdir`/`O_EXCL` lock. Prefer dependency-free unless it proves fragile.
