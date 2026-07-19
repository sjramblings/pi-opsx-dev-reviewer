# Add a trust ledger, standing goals, and weekly compost

## Why

An assessment of an external autonomous-agent doctrine found the harness already implements
its core (four-party loop, deterministic gate, fresh-context verifier, quorum, per-change
ratchet). Three ideas were genuine gaps, and all three are pure/deterministic — no model
call, no billing exposure, no autonomy relaxation — so they fit the supervised harness:
measured per-skill autonomy, re-verified finished-work invariants, and a cross-change
failure ratchet. The cron-autonomy + API-cost frontier was deliberately left out (it
collides with subscription billing).

## What Changes

- `tools/trust.ts` + `just trust` / `just trust-log`: a per-skill autonomy ledger
  (`memory/trust.tsv`) with tiers auto (&ge;20 runs, &ge;95%) / queue / watch (&lt;10 runs or
  &lt;90%) and a loud auto-demotion. The measured version of risk-tiering.
- `tools/verify-goals.ts` + `just goals` + `goals/` store: every finished change graduates
  into a `goals/<name>.md` predicate that is re-verified (flips satisfied&harr;VIOLATED,
  appends `memory/goal-ledger.tsv`, exits non-zero on regression). Generalises the
  `check-learnings` canary to all finished work.
- `prompts/opsx-compost.md`: a weekly cross-change ratchet — read the week's fails and
  propose at most three laws (propose-only, human sign-off).
- `install.sh`: install the compost prompt globally; scaffold `goals/` and copy the trust +
  goals tools per-repo. `memory/` gitignored (runtime state).
- `index.html`: two new cards (trust ledger, standing goals), recipe rows, and a prompts note.

## Capabilities

- **New Capabilities**: `trust-and-goals`

## Impact

New: `tools/trust.ts`, `tools/verify-goals.ts` (+ tests), `goals/`, `prompts/opsx-compost.md`.
Modified: `justfile.opsx` (3 recipes), `install.sh`, `index.html`, `.gitignore`. No new
dependency. Explicitly out of scope: cron heartbeat, cheap-triage economics, unattended
shipping — that frontier needs an API-key-not-OAuth guardrail first.
