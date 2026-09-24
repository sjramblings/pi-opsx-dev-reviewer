# worktree-guard-canary—delta

## ADDED Requirements

### Requirement: A global canary fails closed for unguarded top-level sessions

A guard-presence canary SHALL be installed to pi's global extension path—not the repo's
gitignored `.pi/extensions/`—so that it loads in every working directory. At `session_start`, it
SHALL HALT a top-level session loudly when the current working directory carries the tracked
harness marker (see the marker requirement below) but the `force-delegate` guard is not active.
For top-level classification, `force-delegate` SHALL set `__FORCE_DELEGATE_LOADED` to
`String(process.pid)` and the canary SHALL accept only exact equality with its own
`String(process.pid)`; a missing, stale inherited, or malformed value is not proof of an active
guard. A delegated child SHALL be exempt before handshake evaluation only when its trimmed
`PI_SUBAGENT_DEPTH` consists solely of ASCII decimal digits and represents a positive safe integer.
`force-delegate` SHALL use the same classification and remain inactive in a valid child, leaving its
full tools intact regardless of whether a handshake value was inherited. An unset or zero depth is
top-level; a malformed, negative, non-integer, or unsafe-integer depth SHALL also be treated as
top-level and SHALL NOT trigger the child early return.

#### Scenario: A bare top-level worktree halts

- **WHEN** a top-level pi session starts in a linked worktree that has the tracked harness marker but no provisioned `.pi/extensions/`
- **THEN** the global canary sees the marker, detects that `force-delegate` did not load, and halts the session with a message directing the operator to provision the worktree via `just worktree`

#### Scenario: A provisioned top-level worktree proceeds

- **WHEN** a top-level pi session starts with the tracked harness marker and the guards loaded
- **AND** the in-process `__FORCE_DELEGATE_LOADED` handshake exactly equals `String(process.pid)`
- **THEN** the canary stays silent and the session proceeds

#### Scenario: A delegated child retains full tools regardless of inherited handshake

- **WHEN** a pi session starts with the tracked harness marker and a valid positive-safe-integer `PI_SUBAGENT_DEPTH`
- **THEN** the canary exempts the child before evaluating `__FORCE_DELEGATE_LOADED`, whether that value is missing, current, stale, or malformed
- **AND** `force-delegate` remains inactive and the delegated child retains its full tools

#### Scenario: Malformed depth fails closed as top-level

- **WHEN** a pi session starts with the tracked harness marker and an invalid `PI_SUBAGENT_DEPTH`
- **AND** the handshake is missing, stale, or malformed rather than exactly `String(process.pid)`
- **THEN** the canary treats the session as top-level and halts it

#### Scenario: A stale inherited parent handshake fails closed

- **WHEN** a marker-bearing pi process is classified top-level and inherits a parent process PID in `__FORCE_DELEGATE_LOADED`
- **THEN** the canary rejects that stale value because it does not equal the current `String(process.pid)` and halts

### Requirement: The canary verifies actual load, not mere file presence

The canary SHALL confirm that `force-delegate` is active in the current process via the
process-bound `__FORCE_DELEGATE_LOADED === String(process.pid)` handshake, rather than only checking
that the guard file exists or that an inherited value is present, so that a present-but-unloaded
guard (for example one disabled by a pi loader-breaker) still halts.

#### Scenario: A present-but-broken guard still halts a top-level session

- **WHEN** a top-level session has `.pi/extensions/force-delegate` but it failed to load, leaving the handshake missing, stale, or malformed
- **THEN** the canary halts rather than treating file presence or a non-current-PID value as proof of protection

### Requirement: A tracked harness marker identifies every worktree

The harness SHALL ship a git-tracked marker file (for example `.harness-marker` at the repo root)
that is present in every checkout and every linked worktree by virtue of being tracked, and is
absent from ordinary pi projects. The canary SHALL key its harness-repo detection off this tracked
marker, NOT off the gitignored `.pi/` directory or the local guard set—because a bare worktree,
which is exactly the case the canary must halt, has no `.pi/` yet but does carry every tracked file.

#### Scenario: A bare worktree is still recognised as a harness repo

- **WHEN** a linked worktree is created by `git worktree add` with no provisioning
- **THEN** the tracked marker is present (it is a tracked file) so the canary classifies the worktree as a harness repo and evaluates the guard-load check

#### Scenario: The marker is not keyed off gitignored state

- **WHEN** the canary decides whether the working directory is a harness repo
- **THEN** it tests for the tracked marker and does not rely on `.pi/` or the local guard set, which are gitignored and absent in a bare worktree

### Requirement: The canary does not fire outside harness repos

The canary SHALL halt only when the working directory carries the tracked harness marker, so that
unrelated pi sessions in ordinary directories are not blocked.

#### Scenario: A non-harness directory is not blocked

- **WHEN** a pi session starts in a directory with no tracked harness marker
- **THEN** the canary stays silent and does not halt the session
