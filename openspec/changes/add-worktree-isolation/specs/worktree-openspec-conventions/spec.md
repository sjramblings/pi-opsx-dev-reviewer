# worktree-openspec-conventions—delta

## ADDED Requirements

### Requirement: One active `openspec` change per worktree

`AGENTS.md` SHALL instruct that each worktree works exactly one active `openspec` change on its own
branch, so that concurrent sessions never edit the same `openspec/changes/<name>/` files and race
into a merge conflict.

#### Scenario: The one-change-per-worktree rule is discoverable

- **WHEN** a session reads `AGENTS.md` at the start of work
- **THEN** it finds the rule that a worktree owns a single active change on its own branch

### Requirement: Archive runs on the change branch and lands via a pull request

`AGENTS.md` SHALL state that `openspec archive`—which moves `changes/<name>/` and promotes its
deltas into `openspec/specs/`—runs inside the change's own worktree branch and merges through the
existing PR flow, never as a cross-worktree operation.

#### Scenario: Archive is documented as an on-branch, PR-gated action

- **WHEN** a session prepares to archive a completed change
- **THEN** `AGENTS.md` directs it to archive on the change branch and land the result through a pull request

### Requirement: Overlapping capability edits are called out as a merge hazard

The conventions SHALL warn that two concurrent changes promoting deltas into the same `specs/`
capability will conflict at merge, so operators avoid parallelizing changes that touch one
capability across worktrees.

#### Scenario: The overlapping-capability warning is present

- **WHEN** an operator plans to run two concurrent changes
- **THEN** `AGENTS.md` warns that changes touching the same `specs/` capability will collide at merge and should not be parallelized
