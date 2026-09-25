---
status: accepted
date: 2026-07-21
decision-makers: [maintainer]
---

# Render session-cost HTML safely by escaping every dynamic string at the output boundary

## Context and Problem Statement

The HTML fragment interpolates a filename, model identifiers, coverage state, and diagnostic
reasons derived from an operator-selected `JSONL` file. Those values are untrusted. Selective escaping
can miss future dynamic diagnostics, while adding a DOM dependency is disproportionate.

## Considered Options

- Leave values unescaped because input is local.
- Escape only filenames and model keys.
- Escape every dynamic string immediately before HTML interpolation with one dependency-free helper.
- Build through a DOM or templating dependency.

## Decision Outcome

Chosen: one output-boundary helper encodes `&`, `<`, `>`, `"`, and `'`. Every dynamic string—
session name, model key, coverage label, and diagnostic reason—passes through it immediately
before interpolation. Parsed values remain unchanged for aggregation and text output; numeric values
continue through fixed numeric formatters.

## Consequences

- Good: crafted labels and diagnostic values render as text rather than markup.
- Good: aggregation keys remain unchanged.
- Good: no dependency is added.
- Bad: every future dynamic insertion must use the same boundary helper.
