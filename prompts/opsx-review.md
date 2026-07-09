---
description: Send one change (or the current diff) to the read-only reviewer subagent for an adversarial verdict.
argument-hint: "<change-name> [task-hint]"
---

# Adversarial review of an OpenSpec change

Change: `$1`  ·  Focus: `${2:-the whole current diff for this change}`

Call the `subagent` tool with `agent="reviewer"`. Give it a self-contained brief:

- The task and spec paths under `openspec/changes/$1/` (and `specs/` it must satisfy).
- The raw diff and the raw command/test output as evidence.
- The developer's narrative ONLY inside a clearly-labelled `AUTHOR CLAIMS (untrusted)`
  block — the reviewer treats it as claims to test, not context to trust, and audits
  beyond the areas the author points to.

Relay the reviewer's `VERDICT` block verbatim. A `BLOCK` requires a runnable probe
(failing test, command, or repro); a PLAUSIBLE-only finding cannot block on its own.
