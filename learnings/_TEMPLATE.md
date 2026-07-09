---
schema_version: 1
id: LRN-0000
type: bug-class            # bug-class | review-rule | research-note | decision
scope: ["path/glob/**"]    # one or more forward-slash globs; ** spans segments, * does not span /
tags: [tag-a, tag-b]
severity: medium           # high | medium | low
status: draft              # draft | active | retired | superseded  (only active is injected)
summary: One-sentence imperative rule — this is what gets shown at BRIEF.
source:
  change: <change-folder-name>   # the OpenSpec change this was distilled from
  commit: <short-sha>            # immutable pointer — a SHA, never a line number
created: 2026-01-01
supersedes: null           # id of a learning this replaces, or null
---

## Rule

The rule as an imperative sentence — what the developer must do or must not do.

## Why

The failure this prevents, and where it was caught (review-log entry / probe).

## Example

Bad:

    <the wrong shape>

Good:

    <the right shape>
