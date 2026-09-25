---
status: accepted
date: 2026-09-24
decision-makers: [maintainer]
---

# Port five executed-evidence gates from pi-rukas, re-implemented against this kit

## Context and Problem Statement

A review of pi-rukas, a pi orchestrator whose gates each follow a measured incident, found five
gaps here. The `/opsx-loop` fix loop repeated on `BLOCK` with no bound. `verify-gate` could not
see a net-new skipped test or a ticked task that changed nothing. No guard noticed an agent
repeating one tool call. Pi version statements disagreed across files. Docs prose asserted
specifics nobody checked. The question was which pi-rukas ideas to adopt and how.

## Considered Options

- Install pi-rukas alongside the kit.
- Copy pi-rukas modules verbatim.
- Re-implement five selected ideas as kit-native tools, extensions, and recipes.

## Decision Outcome

Chosen: re-implement five ideas natively. Installing pi-rukas was rejected, on its own
documentation at commit `cd6cb5f`: it defaults to no per-call gating in interactive sessions
and forwards the full host environment, `~/.ssh`, and the Docker socket into its sandbox
([AGENTS.md](https://github.com/trail-openers/pi-rukas/blob/cd6cb5f/AGENTS.md), section 3), and it requires several tools maintained outside
the project, such as `vipune`, `oo`, and `codebase-memory-mcp` ([README](https://github.com/trail-openers/pi-rukas/blob/cd6cb5f/README.md),
Prerequisites). Copying was rejected because its modules are
coupled to its own state machine. Two further ideas were dropped as not applicable: a merge
authority gate (this kit never merges) and a reviewer-verdict rework (the reviewer already
blocks only on a confirmed P0/P1 or a failing probe).

The round cap lives inside `record-verdict`, not a new recipe, because the bash of the orchestrator
is pinned to `record-verdict` and `archive-change`; a separate park recipe would have needed a
new write grant. Every capped task parks: unlike pi-rukas, the loop has no PR or CI stage to
carry findings forward to.

## Consequences

- Good: each gate is deterministic, needs no model, and has a negative test.
- Good: the reviewer gains two read-only gates. Admitting them surfaced two real write paths,
  both closed before merge: `--base --output=x` made `git diff` write a file (fixed by
  resolving `--base` to a commit SHA), and an escaped argument such as `\$\(cmd\)` survived
  the gate and was re-parsed by `just` into command execution (fixed by positional
  arguments in the recipes and a plain-token rule for every `just` argument in
  `architect-scope`).
- Bad: the `git` entry in the read-only command list takes any arguments, so
  `git -c core.fsmonitor=<cmd> status` still executes a command. That predates this change
  and is left as a follow-up.
- Bad: the repeat detector matches exact inputs only; a loop over drifting paths escapes it.
- Bad: `claim-scan` proves presence, not truth: a wrong number copied into two files passes.
