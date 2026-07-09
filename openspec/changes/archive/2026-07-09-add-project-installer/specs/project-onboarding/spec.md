## ADDED Requirements

### Requirement: One command installs the harness into a target repo
The installer SHALL provide a `--here [path]` mode that lays down every project-scoped
piece into the target repo without clobbering existing data files.

#### Scenario: Per-repo install lays down the structural pieces
- **WHEN** `./install.sh --here <repo>` runs against an empty repo
- **THEN** it creates `<repo>/.pi/extensions/` (all guards), `<repo>/tools/`, the `dev-reviewer` schema under `<repo>/openspec/`, `openspec/config.yaml` set to `schema: dev-reviewer`, an `AGENTS.md`, and a `learnings/` scaffold, and wires a `justfile.opsx` import

#### Scenario: Existing data files are never clobbered
- **WHEN** the target repo already has an `AGENTS.md`, a `learnings/` entry, or a `justfile`
- **THEN** the installer keeps them (uses `cp -n`, appends the import rather than overwriting) and reports what it kept

### Requirement: The load-breaker guard scans the installed extension layout
`just check-extensions` SHALL scan both the kit-dev layout (`extensions/*/index.ts`) and the
installed-project layout (`.pi/extensions/*/index.ts`), and SHALL NOT report clean when it
scanned nothing.

#### Scenario: The guard catches a breaker in an installed extension
- **WHEN** a `.pi/extensions/*/index.ts` file contains an apostrophe, backtick, or regex literal
- **THEN** `just check-extensions` exits non-zero and names that `.pi/extensions/...` path

#### Scenario: A repo with no extensions reports nothing-to-check, not a false clean
- **WHEN** neither layout has any extension file
- **THEN** the recipe reports "no extensions found" rather than "clean -- no pi load-breakers"

### Requirement: Session start reminds of the pending lifecycle action
The `opsx-reminder` extension SHALL, for the main agent only, surface a reminder when a
change has all tasks ticked but is not archived, or when draft learnings await promotion,
and SHALL stay silent when nothing is pending.

#### Scenario: All-ticked un-archived change triggers a retro reminder
- **WHEN** a session starts in a repo where `openspec/changes/<c>/tasks.md` is all `[x]` and `<c>` is not under `changes/archive/`
- **THEN** the reminder names `<c>` and directs the operator to run `/opsx-retro <c>` then `just archive-check <c>`

#### Scenario: Nothing pending stays quiet
- **WHEN** every change has open tasks or is archived, and no learning is in draft
- **THEN** the extension emits no reminder

### Requirement: A recipe reports lifecycle position and next action
`just next <change>` SHALL report the task completion count and the single next command to run.

#### Scenario: In-progress change points at the loop
- **WHEN** `just next <c>` runs and `<c>` has unfinished tasks
- **THEN** it reports the done/total count and directs the operator to `/opsx-loop <c>`

#### Scenario: Completed change points at the retro
- **WHEN** `just next <c>` runs and every task in `<c>` is ticked
- **THEN** it directs the operator to `/opsx-retro <c>`, then `just archive-check <c>`, then `openspec archive <c>`
