# Review log — add-learning-loop

Durable record of every reviewer verdict for this change. Under the normal flow the
developer appends each reviewer verdict verbatim before ticking a task. Slice 1 here was
built directly in Claude Code (outside the pi developer/reviewer delegation flow) at the
operator's request; the entries below record the tool-verified evidence for that slice so
the ledger is honest. The deferred tasks (§6) will go through the standard two-subagent
flow.

---

## Slice 1 (tasks 1.1–5.1) — direct build, tool-verified

VERDICT: PASS
FINDINGS: none blocking. Built outside the developer/reviewer delegation flow (noted).
EVIDENCE CHECK:

- `bun test tools/select-learnings.test.ts` → 9 pass / 0 fail (scope match, status filter,
  no-false-positive, cold-start, rename, cap, ordering, frontmatter).
- live selection: matching diff selects LRN-0001 with a trace line; non-matching diff
  renders the cold-start message; both exit 0.
- `just check-learnings`, `just learnings-audit`, `just check-extensions`,
  `openspec validate add-learning-loop --strict` — see the Verification section of the ISA
  and the session transcript for captured output.

<!-- Appended per task, newest last, for the deferred §6 tasks under the standard flow. -->

---

## Advisory — before build commitment boundary

Decision: adjusted — take the advisory for future EXECUTE by requiring the missing design.md/decision settlement before any further build work in this change, especially changed-file derivation, provenance key, promotion evidence, and bounded retrieval schema/cap. This advice is non-gating and was logged for `/opsx-retro` visibility.

SPEC VERDICT: BLOCK

FINDINGS (most severe first):

- [P0] Core operating contract is missing because `openspec/changes/add-learning-loop/design.md` is absent — `openspec/changes/add-learning-loop/design.md` (missing); `openspec/changes/add-learning-loop/proposal.md#What Changes`; `openspec/changes/add-learning-loop/specs/learning-loop/spec.md#Requirement: Scoped learnings are retrieved by changed-file globs`
  gap: the spec says retrieval works from “the list of files a change touches,” but never defines where that list comes from at BRIEF time, what diff/base it uses, or what happens before the first edit when the diff is empty.
  decision needed: define the canonical changed-file source for `/opsx-loop` and the empty/unknown behavior.

- [P1] Provenance will dangle or become ambiguous after archive — `openspec/changes/add-learning-loop/proposal.md#Why`; `openspec/changes/add-learning-loop/specs/learning-loop/spec.md#Requirement: Learnings carry immutable provenance and a promotion gate`
  two readings: `source.change` is the logical change id (`add-project-installer`), or it is the archived folder name/date-prefixed path.
  decision needed: pick the canonical provenance key and exact live/archive resolution rule.

- [P1] “Explicit human ack” is not observable, so the promotion gate is not testable — `openspec/changes/add-learning-loop/specs/learning-loop/spec.md#Requirement: Learnings carry immutable provenance and a promotion gate`
  two readings: a manual `status: active` edit counts as ack, or promotion must leave auditable evidence.
  decision needed: state what artifact proves promotion, and whether seeded active learnings are exempt.

- [P1] Bounded retrieval is underspecified — `openspec/changes/add-learning-loop/proposal.md#What Changes`; `openspec/changes/add-learning-loop/specs/learning-loop/spec.md#Requirement: Retrieval output is bounded and stably ordered`
  gap: no cap value/config source, severity enum, or created-date format is fixed.
  decision needed: state the cap and the exact schema fields that make ordering reproducible.

Is this the simplest approach that satisfies the spec?

- Not yet. The store + selector + audit path is plausible, but without a design it is too many moving parts to call “simplest.”

What is the strongest alternative we are NOT taking, and why might it be better?

- Mine `review-log.md` + archived changes directly, instead of creating a separate mutable `learnings/` store.
- Better because provenance stays native, there is no second lifecycle to audit, and “one fact, one home” becomes much easier to enforce.

What gap will bite in EXECUTE?

- The changed-file derivation. If `/opsx-loop` computes the wrong diff or an empty one, the system will silently inject no learnings while appearing healthy.

Recommendations:

- Write `design.md` before more execution and settle: file-list source, provenance key, promotion evidence, and cap/schema.
- Explicitly record why the direct-from-review-log alternative was rejected.
- Make “no relevant learnings” distinguish true cold-start from “could not derive scope.”
