# reminder-ui Specification

## Purpose

Keep pending `openspec` lifecycle actions visible in Pi through a persistent themed widget and footer status without allowing UI failures to disrupt session startup.

## Requirements

### Requirement: Pending lifecycle actions are pinned in the active theme

`opsx-reminder` SHALL pin the pending actions as a persistent widget and a footer status,
rendered by the client in the active pi theme, and SHALL clear both when nothing is pending.

#### Scenario: A pending action is pinned

- **WHEN** a session starts in a repo with an all-ticked un-archived change
- **THEN** the extension calls setWidget with the reminder lines (placement aboveEditor) and setStatus with a count

#### Scenario: A clean repo clears the reminder

- **WHEN** a session starts with nothing pending
- **THEN** the extension calls setWidget and setStatus with undefined to clear any prior reminder

#### Scenario: UI failure never breaks session start

- **WHEN** a UI call throws or the client ignores it
- **THEN** session start completes and the stderr banner still carries the reminder
