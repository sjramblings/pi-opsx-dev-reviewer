---
status: accepted
date: 2026-07-21
decision-makers: [maintainer]
---

# Roll up only validated assistant usage and persisted parent subagent results

## Context and Problem Statement

subagents execute with `--no-session`, which was initially interpreted to mean their cost was not
persisted. Real parent-session `JSONL` shows that `@mjakl/pi-subagent` persists each child aggregate
under the parent tool result's `message.details.results[]`. Session `JSONL` can also contain
usage-shaped data on roles other than assistant. Which persisted records may contribute without
cross-source inflation?

## Considered Options

- Accept every `message.usage` object and add a new child-cost writer hook.
- Read child sessions and infer parent correlation.
- Accept only validated assistant usage for main cost and validated persisted parent `subagent`
  tool-result children for subagent cost.

## Decision Outcome

Chosen: main cost comes only from `type: "message"` entries whose message role is `assistant` and
whose numeric usage fields pass finite, non-negative validation. Native child cost comes only from
`type: "message"` entries whose message is a `subagent` tool result and whose child usage passes the
same numeric invariant. Assistant tool-call requests are not candidates. The rollup reports separate
`rawNativeCandidates`, deduplicated processed `subagentCalls`, and `duplicateNativeCalls` counts,
with `rawNativeCandidates = subagentCalls + duplicateNativeCalls`. Persisted string entry IDs are
trimmed before comparison; missing, non-string, and whitespace-only IDs use line ordinal as a
compatibility identity, are processed once, and make coverage incomplete.

Each accepted child contributes one call, token counters, and scalar `usage.cost`. Scalar child
cost increments total only because the producer does not persist dollar components. Missing or
invalid labels use source-specific `main/unknown` and `subagent/unknown` keys; explicit trimmed keys
merge only when exactly equal. Every structurally valid main, child, or legacy value is added with
an atomic checked operation: if any impacted accumulator would become non-finite, none of that
value's calls, tokens, or costs are committed and coverage records `aggregate-overflow`.

## Consequences

- Good: existing parent sessions become accountable without a writer hook or child files.
- Good: non-assistant look-alike usage cannot inflate main cost.
- Good: request/result pairs, trim-equivalent IDs, and duplicate persisted IDs cannot double count.
- Good: valid finite inputs cannot produce non-finite displayed aggregates.
- Bad: the parser depends on runtime validation of a third-party details shape.
- Bad: ID-less records and malformed producer data yield partial totals with incomplete coverage.
