---
schema_version: 1
id: LRN-0001
type: bug-class
scope: ["extensions/**/index.ts"]
tags: [pi-loader, tokenizer, silent-failure]
severity: high
status: active
summary: In pi extensions use new RegExp / string methods and no apostrophes or backticks — regex literals silently break the loader.
source:
  change: harden-architect-scope
  commit: 824690b
created: 2026-07-08
supersedes: null
---

## Rule

Inside any `extensions/*/index.ts`, never write a regex literal, a raw backtick, or an
apostrophe (even in a comment or a double-quoted string). Build patterns with
`new RegExp(...)` from plain strings, and keep every quote character balanced.

## Why

pi 0.79.9 loads extensions through a fragile tokenizer that fails the whole file with
"Unterminated string constant" and then **silently disables it** — the guard looks
installed but is not enforcing anything. `bun build`, jiti, and unit tests all pass while
the real pi load path is dead. This silently disabled both `force-delegate` and
`architect-scope` during the dogfood (see SHAKEDOWN.md); `just check-extensions` was added
as the static guard for exactly this class.

## Example

Bad:

    const CHAIN = /&&|\|\|/;              // regex literal -> load breaks
    // don't reintroduce this                // apostrophe in comment -> load breaks

Good:

    const CHAIN = new RegExp("&&|\\|\\|"); // built from a string
    // do not reintroduce this               // no apostrophe
