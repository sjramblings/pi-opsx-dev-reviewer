---
schema_version: 1
id: LRN-0005
type: review-rule
scope: ["cspell.json", ".vale.ini", ".valeignore", "styles/config/vocabularies/**"]
tags: [documentation, spelling, vocabulary]
severity: high
status: draft
summary: Admit genuine identifiers and domain terms only; repair malformed prose instead of adding it to a vocabulary.
source:
  change: add-session-cost
  commit: 171dfafbf6639343aa509145a887864e4a4a1d00
created: 2026-07-23
supersedes: null
---

# LRN-0005—vocabulary does not fix prose

## Rule

Add a spelling exception only for a verified identifier, package name, proper noun, or domain
term. When a token is malformed prose, correct the source text. Never split a misspelling with
formatting or add it to a global vocabulary merely to make a gate green.

## Why

During `add-session-cost` documentation cleanup, malformed concatenations were added to cspell's
global word list, and earlier automatic substitutions split words with stray backticks. The lint
gate became green while preserving or creating semantic defects.

## Refutation (the hard-to-vary core)

- **conjectured:** a zero-error spelling result means the documentation no longer contains spelling defects.
- **refuted_by:** the reviewer found genuine malformed prose accepted by newly added global vocabulary entries.
- **learned:** spelling configuration can hide defects, so every exception needs identifier or domain provenance.
- **criterion_now:** review vocabulary diffs independently and fix ordinary prose in its source file.

## Example

Bad:

    Add a concatenated prose typo to the global word list.

Good:

    Correct the prose; narrowly suppress only a verified identifier such as a package name.
