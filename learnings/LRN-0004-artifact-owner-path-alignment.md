---
schema_version: 1
id: LRN-0004
type: review-rule
scope: ["openspec/schemas/**", "extensions/architect-scope/**"]
tags: [artifact-ownership, path-guard, openspec]
severity: high
status: draft
summary: Verify that every artifact owner's enforced write scope includes the artifact's resolved output path.
source:
  change: add-session-cost
  commit: 171dfafbf6639343aa509145a887864e4a4a1d00
created: 2026-07-23
supersedes: null
---

# LRN-0004—artifact owner path alignment

## Rule

Before assigning an artifact to an agent, resolve its output path and prove that the agent's
runtime write guard permits that path. Treat an ownership assignment without writable-path
alignment as an invalid schema contract.

## Why

The `add-session-cost` schema required a change-local architecture artifact, but the architecture
writer could write only under the root `docs/architecture/**` tree. The assigned agent produced
content but could not materialize its required artifact, blocking completion until another actor
wrote the file.

## Refutation (the hard-to-vary core)

- **conjectured:** naming an agent as artifact owner is sufficient to make that artifact producible.
- **refuted_by:** the architecture writer's runtime guard rejected the change-local output path assigned by the schema.
- **learned:** ownership is valid only when the declared output path intersects the owner's enforced write scope.
- **criterion_now:** preflight every owner/output pair against the same path policy enforced at runtime.

## Example

Bad:

    owner: architecture-writer
    output: openspec/changes/<change>/docs/architecture/README.md
    allowed writes: docs/architecture/**

Good:

    owner output path is explicitly included in the owner's guarded write prefixes
