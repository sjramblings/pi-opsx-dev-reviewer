---
schema_version: 1
id: LRN-0003
type: bug-class
scope: ["justfile.opsx", "install.sh"]
tags: [justfile, import, install, collision]
severity: high
status: draft
summary: A justfile fragment meant to be imported must not define `default` (or any common recipe name) — it collides with the host justfile and breaks every recipe.
source:
  change: add-project-installer
  commit: 8c0283c
created: 2026-07-09
supersedes: null
---

## Rule

Any file installed to be `import`ed into a host justfile (`justfile.opsx`) must contain only
uniquely-named recipes and NEVER a `default` recipe. The importing/host justfile owns
`default`. Detect the host justfile case-insensitively (`Justfile` vs `justfile`) before
appending an import, and append at most once.

## Why

`install.sh --here` shipped the kit justfile verbatim as `justfile.opsx`, including its
`default: @just --list`. On any real repo that already has its own `default`,
`just` errors "Recipe default first defined ... is redefined ..." and
every recipe — the host's own included — stops working. macOS case-insensitive fs also hid
a `Justfile` vs `justfile` mismatch. Fix: split recipes into a default-free `justfile.opsx`;
the kit `justfile` owns `default` and imports it.

## Example

Bad (justfile.opsx):

    default:
        @just --list
    check-extensions:
        ...

Good (justfile.opsx has no default; the host/kit justfile owns it and does `import "justfile.opsx"`).
