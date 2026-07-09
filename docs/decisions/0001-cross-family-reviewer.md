---
status: accepted
date: 2026-07-07
decision-makers: [maintainer]
---

# Run the reviewer on a different model family from the developer

## Context and Problem Statement

The kit gates every implementation task through an adversarial reviewer. If the reviewer
runs on the same model family as the developer, they share a training corpus and therefore
share blind spots — the reviewer is likely to miss exactly the errors the developer was
prone to make. What model should the reviewer run on?

## Considered Options

- Same family as the developer (both Claude), simplest to configure.
- A different family from the developer (developer on Claude, reviewer on GPT-5.5).
- A panel of multiple reviewers across families.

## Decision Outcome

Chosen: a different family from the developer. Cross-family review catches correlated
blind spots that same-family review misses, and the marginal cost of one extra provider is
low. A full panel is deferred — one cross-family reviewer captures most of the benefit at a
fraction of the token cost.

## Consequences

- Good: the reviewer is structurally positioned to catch what the developer could not.
- Good: false positives stay controllable because a single reviewer is easy to tune.
- Bad: two providers must be configured on the target machine (see the install model check).
- Bad: cross-family verdicts occasionally disagree on style; the empirical BLOCK gate
  (a block needs a runnable probe) keeps that from stalling the loop.
