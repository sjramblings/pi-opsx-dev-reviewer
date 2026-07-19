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

# _TEMPLATE

## Rule

The rule as an imperative sentence — what the developer must do or must not do.

## Why

The failure this prevents, and where it was caught (review-log entry / probe).

## Refutation (the hard-to-vary core)

The epistemic record — what we believed, what broke it, what survives. This is what makes an
accumulated learning compound rather than pile up (a flat rule says the "what"; this says the
"why it is true"). Keep all four lines; a learning without a refutation is an assumption.

- **conjectured:** what we believed was true / safe / sufficient
- **refuted_by:** the concrete evidence that broke it (a probe, a failing run, a review finding)
- **learned:** the durable insight that survives
- **criterion_now:** the rule or probe that now guards it

## Example

Bad:

    <the wrong shape>

Good:

    <the right shape>
