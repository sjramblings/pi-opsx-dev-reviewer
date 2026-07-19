# Generate enterprise architecture documentation from the repo

## Why

The kit ships `tech-writer`, which documents one change for a *user* under Diátaxis. It has no
agent that answers the *stakeholder* question: what is this system, what did it decide, and what
does it give up. That artifact is what an engineering engagement contracts for, and today it is
hand-written or absent.

Two findings shape the design. First, every credible-documentation tradition converges on one
test — a document is credible if and only if it names what it gives up (Nygard's Consequences,
MADR "Bad, because", Zimmermann's Free Lunch Coupon anti-pattern, Richardson's pattern format,
Google's trade-offs section). Fluff is the absence of stated cost, and that is mechanically
checkable. Second, architecture documents rot because they duplicate facts derivable from the
code (SEI: "repetition is the root of inconsistency"). Rot is a design failure, not a discipline
failure. So the document records only what the code cannot state — decisions, rationale,
constraints, quality evidence — and derives the rest at generation time, refreshed at archive
rather than maintained by hand.

## What Changes

- A new `architecture-writer` subagent owns `docs/architecture/` — an arc42 section tree derived
  from the repo (code, IaC, config, OpenSpec artifacts), never from intent.
- The writer **indexes** ADRs and never authors one. An architecturally significant decision found
  in code with no ADR becomes a decision-debt finding, not invented rationale.
- Well-Architected claims are grounded in the `aws-well-architected-corpus` mirror: every claim
  carries a best-practice ID, its risk level, its source URL, and repo evidence. HIGH-risk best
  practices are the default scope.
- A new `just arch-lint` gate enforces stated cost, resolvable best-practice IDs, evidence for
  every met claim, and section completeness. `just archive-check` requires the artifact when a
  change touched an architecturally significant path.
- `architect-scope` gains a per-agent path allowlist so the writer can reach `docs/architecture/`
  and is blocked from `docs/decisions/`.

## Capabilities

### New Capabilities

- `architecture-doc`: the arc42 section tree, its derivation rules, ownership boundary, and provenance stamp
- `waf-grounding`: Well-Architected claims grounded in the pinned corpus, HIGH-risk default
- `arch-lint`: the mechanical gate on the architecture artifact and its archive-time trigger
- `agent-path-scoping`: per-agent write path allowlists in `architect-scope`

## Impact

New: `agents/architecture-writer.md`, `openspec/schemas/dev-reviewer/templates/architecture.md`,
`docs/architecture/**`, `docs/decisions/0002-architecture-writer-agent.md`.
Modified: `extensions/architect-scope/index.ts` (tokenizer-constrained — no regex literals, no
backticks, no apostrophes), `install.sh` (agent copy loop and model check), `schema.yaml` (new
artifact plus apply step), `justfile.opsx`, `cspell.json`, `README.md`, `index.html`.
Depends on the `sjramblings/aws-well-architected-corpus` mirror via the `pi-skill-wellarchitected`
lookup tools; the corpus is pinned by tag and synced, never scraped by this kit.
