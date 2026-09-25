---
status: accepted
date: 2026-07-21
decision-makers: [maintainer]
---

# Prevent duplicate subagent cost by preferring native usage over legacy annotations session-wide

## Context and Problem Statement

The rollup recognizes a top-level `subagentCost` object, while current sessions persist native child
usage inside `subagent` tool-result details. Legacy annotations have no required child correlation
key. Summing both can charge one child twice; choosing native can omit an uncorrelated historical
child. Which precedence and coverage claim remain defensible?

## Considered Options

- Sum native and legacy values and claim a complete total.
- Prefer native only when both shapes occur on the same record.
- Prefer valid native usage session-wide; use legacy only when no valid native child exists and mark
  every fallback or mixed-source file incomplete.
- Remove legacy support.

## Decision Outcome

Chosen: deduplication occurs before native child validation and source selection. Valid,
aggregate-safe native child usage from non-duplicate processed candidates is authoritative for the
entire session. If any such child is accepted, every valid legacy annotation is excluded. If none is
accepted, valid aggregate-safe legacy values contribute under `subagent/unknown` as fallback.
Native and legacy values never both enter one total. A valid child found only in a rejected duplicate
is ignored and does not activate native precedence.

Top-level `subagentCost` is an independent line-level legacy source, so it remains eligible even
when it is co-located with a rejected duplicate native candidate. Duplicate rejection applies only
to that record's native `message.details`.

A legacy annotation proves an aggregate cost record, not child-run cardinality. Each accepted
fallback annotation contributes its cost under `subagent/unknown` but contributes zero model-row
calls and tokens. Model-row calls count only accepted main assistant messages and accepted native
child results. The `legacy-fallback` reason count separately exposes accepted annotation count; for
example, two accepted legacy annotations render `legacy-fallback: 2` while
`subagent/unknown.calls` remains zero.

The externally visible coverage is `complete` or `incomplete`. Both renderers consume one shared
reason list using this closed canonical order: `malformed-main`, `duplicate-native-call`,
`idless-native-call`, `malformed-native-container`, `malformed-native-child`,
`malformed-legacy-annotation`, `no-usable-subagent-cost`, `legacy-fallback`,
`ignored-legacy-annotation`, `aggregate-overflow`. Each positive file-wide count renders exactly
once as `<code>: <count>`. Coverage is incomplete iff this list is non-empty, and an incomplete
accepted total is never described as full spend.

## Consequences

- Good: the rollup cannot double charge native and legacy child cost.
- Good: legacy-only files remain readable and their accepted cost enters the grand total without
  inventing child-call or token counts.
- Good: ambiguity is explicit rather than hidden behind a "complete" label.
- Good: legacy eligibility does not depend on whether an unrelated native details object on the
  same line survived deduplication.
- Good: reason codes, counts, and order are an externally testable renderer contract.
- Bad: a hybrid file may omit an uncorrelated legacy-only child.
- Bad: a legacy model row can legitimately show cost with zero calls and tokens because the source
  does not encode child-run cardinality.
- Bad: renderers and tests must preserve coverage-reason parity.
