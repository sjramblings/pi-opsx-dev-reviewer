## ADDED Requirements

### Requirement: Scoped learnings are retrieved by changed-file globs
The harness SHALL provide a deterministic retrieval engine that, given the list of files a
change touches, returns exactly the learnings whose `scope` glob matches at least one
changed file and whose `status` is `active`, and no others.

#### Scenario: A scope glob that matches a changed file is selected
- **WHEN** an active learning has `scope: ["extensions/**/index.ts"]` and the changed files include `extensions/foo/index.ts`
- **THEN** the engine includes that learning in its output and records a trace line stating which glob matched which file

#### Scenario: A learning whose scope matches nothing is not selected
- **WHEN** an active learning has `scope: ["src/auth/**"]` and no changed file is under `src/auth/`
- **THEN** the engine excludes it and records a `no-scope-match` trace line

#### Scenario: Non-active learnings are never injected
- **WHEN** a learning has `status: draft`, `retired`, or `superseded`
- **THEN** the engine excludes it regardless of scope match

#### Scenario: Cold start returns clean-empty
- **WHEN** there are no learnings, or none match the changed files
- **THEN** the engine exits 0 and renders a clear "no relevant learnings" message with no error

### Requirement: Retrieval output is bounded and stably ordered
The engine SHALL cap the number of returned learnings and order them deterministically so
that BRIEF cost is bounded and reproducible.

#### Scenario: Result is capped with a recorded trace
- **WHEN** more matching active learnings exist than the cap
- **THEN** the engine returns exactly the cap and records a `capped N -> cap` trace line

#### Scenario: Ordering is severity then recency then id
- **WHEN** multiple learnings match
- **THEN** they are ordered by severity descending, then created-date descending, then id

### Requirement: One fact, one writable home
Scoped rules SHALL live only in `learnings/`; global always-on invariants SHALL live only
in `AGENTS.md`; `review-log.md` SHALL remain an append-only ledger. The same rule SHALL NOT
be written to more than one home.

#### Scenario: Retro routes a scoped rule to learnings only
- **WHEN** `/opsx-retro` distils a recurring finding that applies to specific paths
- **THEN** it writes a scoped `learnings/` entry and does NOT also add the rule to AGENTS.md

### Requirement: Learnings carry immutable provenance and a promotion gate
Each learning SHALL record its source as a change folder plus a commit sha (never a line
number). A new learning SHALL start as `draft` and be promoted to `active` only by explicit
human ack, so an ungated distillation cannot pollute future briefs.

#### Scenario: Audit fails a dangling active learning
- **WHEN** an `active` learning names a `source.change` that resolves to no change folder, or is missing a required field
- **THEN** `just learnings-audit` exits non-zero and names the offending file

#### Scenario: A freshly distilled learning is not injected until promoted
- **WHEN** `/opsx-retro` writes a new learning
- **THEN** it is `status: draft` and the retrieval engine does not inject it until it is promoted to `active`

### Requirement: The retrieval path is guarded by a canary
The harness SHALL provide a canary that fails loudly if retrieval silently returns nothing
for a diff that must match, or returns a false positive for a diff that must not.

#### Scenario: Canary catches a broken selector
- **WHEN** `just check-learnings` runs against a hermetic fixture with a known active learning
- **THEN** it passes only if the matching diff selects the learning and the non-matching diff does not, and exits non-zero otherwise
