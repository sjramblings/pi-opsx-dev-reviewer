---
schema_version: 1
id: LRN-0002
type: bug-class
scope: ["justfile", "justfile.opsx"]
tags: [recipe, layout, false-pass, guard]
severity: high
status: draft
summary: A recipe that globs one fixed directory silently false-passes when copied to a repo with a different layout — scan every real layout and fail-loud on an empty match set.
source:
  change: add-project-installer
  commit: 8c0283c
created: 2026-07-09
supersedes: null
---

## Rule

Any guard/check recipe that scans a hardcoded directory glob must scan every layout the
recipe will run under (kit-dev AND installed), and must report "nothing to check" rather
than success when the glob matches zero files. Use `shopt -s nullglob` and an explicit
empty-set branch.

## Why

`check-extensions` scanned only `extensions/*/index.ts`. Once `install.sh --here` copies the
recipe into a target repo where the guards live in `.pi/extensions/`, the glob matched
nothing, `grep` errored, but `rc` stayed 0 — so the load-breaker guard printed "clean" while
checking nothing, in every installed repo. A guard that silently checks nothing is worse
than no guard. Caught only by a live install-into-temp-repo run, not by static checks.

## Example

Bad:

    for f in extensions/*/index.ts; do ...; done   # false-passes on a different layout

Good:

    shopt -s nullglob
    files=(extensions/*/index.ts .pi/extensions/*/index.ts)
    if [ ${#files[@]} -eq 0 ]; then echo "nothing to check"; exit 0; fi
