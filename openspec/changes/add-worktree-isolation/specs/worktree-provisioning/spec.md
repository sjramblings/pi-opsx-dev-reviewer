# worktree-provisioning—delta

## ADDED Requirements

### Requirement: A single recipe creates an isolated, guarded worktree

`just worktree <name>` SHALL create a linked git worktree on a new feature branch derived from
`<name>`, and SHALL provision the gitignored guard state into it, so that a pi session started in
the new worktree is fully guarded without any manual copy step.

#### Scenario: Creating a worktree yields a guarded checkout

- **WHEN** `just worktree feat-x` runs in the primary checkout
- **THEN** a new linked worktree directory exists on a new branch derived from `feat-x`
- **AND** its `.pi/extensions/` is populated with the full guard set (force-delegate, branch-guard, architect-scope, developer-guard, opsx-reminder, and the shared `lib`)

#### Scenario: Tracked harness state is supplied by git, not re-copied

- **WHEN** the recipe provisions a worktree of a repo where `openspec/`, `tools/`, `schemas/`, and `config.yaml` are git-tracked
- **THEN** it relies on the git checkout for those paths and does not overwrite them from the kit source

### Requirement: Provisioning is guards-only and idempotent

The provisioning step SHALL copy only gitignored guard state, and re-running it against an
existing worktree SHALL converge to the same result without duplicating or corrupting any file.

#### Scenario: Re-provisioning an existing worktree is safe

- **WHEN** the provisioning step runs a second time against an already-provisioned worktree
- **THEN** it completes without error and the guard set is present exactly once

### Requirement: worktree removal is clean

A documented removal path SHALL remove a worktree—`just worktree-rm <name>`—without touching the
shared object store or the primary checkout. Because provisioning writes untracked ignored state
(`.pi/` and the `memory` symlink) into the worktree, a plain `git worktree remove` will refuse it as
unclean; the removal path SHALL account for that, either by removing the provisioned ignored paths
first or by using `git worktree remove --force`, followed by `git worktree prune`. The removal SHALL
delete only the worktree's own `.pi/`/symlink, never the primary's shared `memory/` target.

#### Scenario: Removing a provisioned worktree succeeds despite ignored state

- **WHEN** `just worktree-rm feat-x` runs against a worktree that was provisioned with `.pi/` and a `memory` symlink
- **THEN** the removal completes rather than failing on the untracked ignored state, and the `feat-x` worktree directory and its git registration are removed

#### Scenario: Removing a worktree leaves the primary intact

- **WHEN** `just worktree-rm feat-x` runs
- **THEN** the primary checkout, its `memory/` ledger, and the shared object store are unaffected
