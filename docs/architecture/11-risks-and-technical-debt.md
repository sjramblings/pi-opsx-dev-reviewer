# 11. Risks and Technical Debt

## Known risks

| Risk | Evidence | Mitigation |
| --- | --- | --- |
| A read-only reviewer cannot run tests or probes, so a verdict can rest on the developer's unverified narrative | `agents/reviewer.md:6` | An independent audit re-ran the gates and reopened four verdicts that did not survive (`openspec/changes/add-architecture-writer/review-log.md`). The structural fix — an attested-probe channel the reviewer can verify — is still open. |
| The pi tokenizer silently disables a guard on a stray regex literal, backtick, or apostrophe | `extensions/architect-scope/index.ts:17` | Static scan `just check-extensions` (`justfile.opsx:245`) plus the session-start canary (`extensions/harness-selftest/index.ts:28`). |
| The docs lint gate has never run to green and is not wired into CI | `justfile.opsx:7` | Tracked as a separate change (`fix-spec-template-lint`) that settles the lint floor and adds CI. |
| An attested probe output can drift from current tool behaviour | `openspec/changes/add-architecture-writer/probes/task-4.1-arch-lint-regression.out` | Flagged for re-attestation in the review ledger before archive. |

## Technical debt

- **Third-party Python dependency.** `tools/waf-grounding.ts` invokes an external
  `wa_lookup.py` as a subprocess. The kit is otherwise TypeScript-only; this crosses the
  house language rule but is a third-party skill the kit does not own.
- **Documentation gate backlog.** The markdownlint floor fires on rules that were inherited
  rather than chosen, producing a large backlog that predates this tree.

## Decision debt

Architecturally significant choices in the code with no dedicated ADR:

- **Fail-closed authorization model** (`extensions/architect-scope/index.ts:38`) — a
  load-bearing security decision recorded only in code comments and the extension spec, with
  no standalone ADR.
- **Three-state graceful-skip gate contract** (`justfile.opsx:7`) — the `FAIL`/`PARTIAL`/
  `clean` convention is applied across every gate but has no ADR stating why `PARTIAL` must
  never collapse to a pass.

These are recorded as debt, not reconstructed rationale; authoring the ADRs belongs to the
`solution-architect`, not to this document.
