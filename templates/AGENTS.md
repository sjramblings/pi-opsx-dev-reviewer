# AGENTS.md

Operational back-pressure for this repo — the pitfalls the reviewer keeps catching,
distilled into rules so the developer avoids them up front. Copy this template to your
repo root and grow it from real review findings via `/opsx-retro`.

Keep it under ~60 lines. Every line is earned by a real past failure. Status updates
and progress notes do NOT belong here — those live in the change's `tasks.md` and
`review-log.md`. A bloated AGENTS.md pollutes every delegation's context; prune it
like code.

## Apply bookkeeping

- Before invoking `/opsx-loop`, run pi's built-in `/session` in the persisted top-level session and copy its exact absolute `File:` path into the loop's second argument: `/opsx-loop add-foo "/Users/alice/.pi/agent/sessions/--work-repo--/session.jsonl"`. Pi has no documented session-path environment variable; never infer the parent from the newest session or an mtime. A missing, relative, or `In-memory` path fails closed.
- After each reviewer verdict, the orchestrator runs the concrete two-argument `just record-verdict` command rendered by `/opsx-loop` from the change name and that exact `/session` path. Execute only the rendered command, and append the ledger before the developer ticks the task.
- If apply was entered without the rendered `/opsx-loop` prompt, stop and ask the operator to obtain the path with `/session` and re-enter the loop; do not guess or discover a candidate session file.
- After the last task, delegate the docs artifact to the `tech-writer` subagent, run `/opsx-retro <change>`, then close out with `just archive-change <change>`.

## Worktree conventions

- Each worktree owns exactly one active OpenSpec change on its own branch.
- Run guarded `just archive-change <change>` on the owning change's worktree branch and land it through a pull request; never archive across worktrees.
- Never parallelize concurrent changes that edit the same `openspec/specs/<capability>`. Their delta promotions collide at merge.

## Rules

- Keep README.md and index.html current with shipped user-facing features; a stale entry doc is a BLOCK finding (enforced by the dev-reviewer `docs` artifact).
- Reproduce before fixing: a bug-fix task's FIRST `probe:` must be a failing reproduction, and the fix must show red→green evidence. A fix with no reproduction is a BLOCK finding.

<!-- One line per rule. Example shape: -->
<!-- - Validate every boundary response shape before trusting it (caught 3× in review). -->
<!-- - No empty catch blocks; a swallowed error is a BLOCK finding. -->

## Architecture diagrams

Mermaid is the default and the only required diagram contract. The arc42 sections 3 (context
and scope), 5 (building block view), and 7 (deployment view) each need a Mermaid fence, and
`just arch-lint` fails without one.

Structurizr is an optional extra, installed only by
`./install.sh --here <repo> --with-structurizr`. When it is absent, do not invoke it and do not
warn about it. When it is present:

- `docs/architecture/structurizr/workspace.dsl` is team-owned source. Update the existing file;
  never create or replace it, and never let a tool clobber it.
- Keep hierarchical identifiers, the canonical view keys `context`, `container`, and
  `component`, and at least one relationship that reaches a component directly.
- It stays one self-contained file. No include, workspace extension, docs/ADR, script, plugin,
  or remote theme.
- A model change is a source change: it goes through maintainer review.
- Generated SVG never satisfies a Mermaid requirement and is never embedded in the
  architecture tree or its HTML. Output under `build/architecture/structurizr/` is ignored and
  never committed.
