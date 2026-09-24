# 1. Introduction and Goals

The kit turns pi into a guarded delegation pipeline for designing, implementing, reviewing, and
documenting `openspec` changes. The main process is structurally prevented from writing while
specialist subprocesses receive role-specific tools (`extensions/force-delegate/index.ts:6`,
`agents/reviewer.md:6`). The install script copies the project-scoped harness into a selected host
repository (`install.sh:62`).

The shipped utility surface also includes a local session-cost rollup. It reads a selected pi `JSONL`
session and reports accepted main-agent and persisted subagent usage by model, subtotal, grand total,
and coverage state (`tools/session-cost.ts:459`, `tools/session-cost.ts:349`).

## Stakeholders

| Stakeholder | Architectural expectation | Evidence |
| --- | --- | --- |
| Kit maintainer | Guards fail loudly instead of silently disabling policy. | `extensions/harness-selftest/index.ts:22` |
| Repository operator | Installation and lifecycle commands remain local and inspectable. | `install.sh:62`, `justfile.opsx:470` |
| Delegated agents | Tool and path authority matches the declared role. | `agents/architecture-writer.md:6`, `extensions/architect-scope/index.ts:59` |
| Cost-report consumer | Accepted cost is not presented as complete when persisted input is malformed or ambiguous. | `tools/session-cost.ts:359`, `tools/session-cost.ts:386` |
| Change reviewer | Verdict evidence persists outside chat history. | `openspec/schemas/dev-reviewer/schema.yaml:68` |

## Concerns—authorization, failure visibility, accounting, evidence, and portability

These concerns are grounded in the write guard, startup canary, coverage state, review ledger, and
file-copy installer (`extensions/force-delegate/index.ts:6`,
`extensions/harness-selftest/index.ts:22`, `tools/session-cost.ts:359`,
`openspec/schemas/dev-reviewer/schema.yaml:68`, `install.sh:69`). The architecture accepts added
guards, diagnostics, and local operator setup rather than weakening those boundaries.

## Quality goals

1. **Structural safety before convenience.** Authorization is enforced at tool boundaries rather
   than only in prompts (`extensions/force-delegate/index.ts:6`). The accepted cost is subprocess
   delegation overhead and inability of read-only reviewers to execute tests (`agents/reviewer.md:6`).
2. **Accounting integrity before optimistic completeness.** The rollup selects validated,
   non-overlapping persisted sources and emits incomplete coverage when diagnostics exist
   (`tools/session-cost.ts:281`, `tools/session-cost.ts:327`, `tools/session-cost.ts:359`). The
   accepted cost is that ambiguous or malformed spend is excluded rather than guessed.
3. **Portability before managed-service convenience.** The harness and session-cost command are
   file-copy installed and run locally (`install.sh:69`, `install.sh:74`). The accepted cost is that
   each operator owns local runtime and toolchain setup.

## Optional Structurizr diagram path

A second, opt-in diagram path renders C4 context, container, and component views from one
Structurizr model (`justfile.structurizr:15`, `tools/structurizr-render.ts:1`). Mermaid remains the
default and the only required contract; the option exists for teams that need many C4 views kept
consistent from a single source. Its quality goal is that nothing unverified ever reaches
`build/architecture/structurizr/`. The accepted cost is a Docker and Bun prerequisite that the
default install does not carry (`install.sh:149`).
