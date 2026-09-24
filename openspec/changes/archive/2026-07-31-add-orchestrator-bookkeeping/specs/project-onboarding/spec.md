# project-onboarding—delta

## MODIFIED Requirements

### Requirement: Session start reminds of the pending lifecycle action

The `opsx-reminder` extension SHALL, for the main agent only, surface a reminder when a
change has all tasks ticked but is not archived, or when draft learnings await promotion,
and SHALL stay silent when nothing is pending.

#### Scenario: All-ticked un-archived change triggers a retro reminder

- **WHEN** a session starts in a repo where `openspec/changes/<c>/tasks.md` is all `[x]` and `<c>` is not under `changes/archive/`
- **THEN** the reminder names `<c>` and directs the operator to run `/opsx-retro <c>`, whose terminal close-out command is `just archive-change <c>`

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
- **THEN** it directs the operator to `/opsx-retro <c>`, then `just archive-change <c>`
