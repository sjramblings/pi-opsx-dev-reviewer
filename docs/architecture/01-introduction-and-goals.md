# 1. Introduction and Goals

The kit turns **pi** (a coding agent) into a delegating, self-guarding software factory: a
design → implement → review → document pipeline where a read-only main agent delegates to
specialist subagents, structural guards fail closed, and review evidence is produced by a
neutral party. The whole harness installs into any repository (`install.sh:60`,
`install.sh:5`).

## Stakeholders

| Stakeholder | Architectural expectation |
| --- | --- |
| Kit maintainer | The guards actually hold; a broken guard fails loudly rather than silently. |
| Operator using the kit in a repo | One command installs the harness; the change lifecycle is legible via `just next` (`justfile.opsx:389`). |
| Delegated subagents (developer, reviewer, architect, tech-writer, spec-reviewer, architecture-writer) | Each has exactly the tools its role needs and no more (`agents/reviewer.md:6`, `agents/developer.md:6`). |
| Reviewer of a change | Verdict evidence survives in a durable ledger, not chat scrollback (`openspec/schemas/dev-reviewer/schema.yaml:68`). |

Concerns: the stakeholder concerns this architecture must address are authorization
integrity (a guard cannot be bypassed by prompt), failure visibility (a broken guard is
loud, not silent), evidence durability (a verdict survives beyond one session), and
portability (the harness installs anywhere by file copy). Each is traced to a quality goal
below.

## Quality goals

The three quality attributes that shape the architecture, in priority order:

1. **Structural safety over convenience.** Authorization is enforced by code and process
   isolation, not by prompt instructions. A reviewer that must not write is given no write
   tool (`agents/reviewer.md:6`); the main agent that must delegate is blocked at the tool
   call (`extensions/force-delegate/index.ts:6`).
2. **Loud failure over silent degradation.** A guard that fails to load halts the session
   with a banner (`extensions/harness-selftest/index.ts:22`); a gate that cannot run its
   tools reports `PARTIAL`, never a false `clean` (`justfile.opsx:7`).
3. **Portability.** The harness is file-copy installable into any repo with no service
   dependency (`install.sh:66`).

## Requirements overview

The functional core is the delegation loop: the main agent is made read-only, so the only
way it can change code is to call a subagent (`extensions/force-delegate/index.ts:6`). The
OpenSpec `dev-reviewer` schema bakes the developer/reviewer contract into the apply step
(`openspec/schemas/dev-reviewer/schema.yaml:119`).
