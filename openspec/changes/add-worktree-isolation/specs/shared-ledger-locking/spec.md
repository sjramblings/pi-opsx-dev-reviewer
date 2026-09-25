# shared-ledger-locking—delta

## ADDED Requirements

### Requirement: The memory ledgers are shared across worktrees

Provisioning SHALL point each worktree's `memory/` at the primary checkout's ledger (via symlink)
so that learnings, goals, and trust compound across concurrent sessions rather than fragmenting
into per-worktree copies.

#### Scenario: A learning recorded in one worktree is visible in another

- **WHEN** a session in one worktree writes to the shared ledger
- **THEN** a session in another worktree of the same repo reads that same ledger state

### Requirement: The whole-file read-modify-write ledger is atomic under concurrency

The trust ledger writer (`tools/trust.ts`) SHALL serialize concurrent writes with a lock and write
atomically (temp file then rename)—it reads the whole `memory/trust.tsv`, modifies it, and writes
it back—so that no update is lost when multiple worktree sessions write at overlapping times.
This requirement applies to whole-file read-modify-write ledgers only; ledgers that a writer solely
appends to are out of its scope (see the append-only requirement below).

#### Scenario: Concurrent verdict writes both persist

- **WHEN** two sessions record a trust update to `memory/trust.tsv` at overlapping times
- **THEN** both updates are present in the ledger afterwards, with neither lost

#### Scenario: A crashed writer does not deadlock the ledger

- **WHEN** a writer process dies while holding the lock
- **THEN** the stale lock is broken or times out so a later writer can proceed

### Requirement: Append-only ledgers stay lock-free

Append-only writers SHALL remain plain appends and SHALL NOT acquire the ledger lock—this covers
`tool-events.jsonl` and the goal-ledger append in `tools/verify-goals.ts` (`memory/goal-ledger.tsv`)
—because line-sized appends are already concurrency-safe and routing them through the lock would
serialize for no gain. The per-goal `goals/<name>.md` stamp is a per-worktree file and is likewise
out of the lock's scope.

#### Scenario: Blocked-event appends do not contend on the lock

- **WHEN** multiple sessions append blocked-tool events at once
- **THEN** each line is written via a plain append without acquiring the ledger lock

#### Scenario: Goal-ledger appends stay lock-free

- **WHEN** concurrent sessions append goal-verification rows to `memory/goal-ledger.tsv`
- **THEN** each row is appended without acquiring the lock, because the writer only appends and never rewrites the whole file
