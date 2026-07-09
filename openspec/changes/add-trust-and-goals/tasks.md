# Tasks — add-trust-and-goals

> Built + verified directly this session (outside the pi delegation flow); evidence in
> review-log.md. Scope: the deterministic, no-billing subset of the assessed doctrine.

## 1. Trust ledger

- [x] 1.1 `tools/trust.ts` (log / render / tier) with tiers auto/queue/watch + demotion alert,
      plus `tools/trust.test.ts`.
      probe: `bun test tools/trust.test.ts` passes; 20 passes -> tier auto; 2 fails after -> queue.
- [x] 1.2 `just trust` renders the table; `just trust-log <skill> <pass|fail>` records a result.
      probe: `just trust` shows the table; `just trust-log x pass` updates memory/trust.tsv.

## 2. Standing goals

- [x] 2.1 `tools/verify-goals.ts` runs predicates, flips satisfied/VIOLATED, appends the
      ledger, exits non-zero on regression; plus `tools/verify-goals.test.ts`; `goals/`
      store with `_TEMPLATE.md`, `README.md`, and one seeded real goal.
      probe: `bun test tools/verify-goals.test.ts` passes; `just goals` runs the seeded predicate and exits 0.
- [x] 2.2 `just goals` re-verifies all goals.
      probe: `just goals` prints "all N standing goal(s) hold" and writes memory/goal-ledger.tsv.

## 3. Compost prompt

- [x] 3.1 `prompts/opsx-compost.md` — weekly cross-change, at most three proposals, propose-only.
      probe: `grep -q 'at most' prompts/opsx-compost.md` and it is installed by install.sh.

## 4. Wiring + docs

- [x] 4.1 `install.sh` installs the compost prompt globally and scaffolds goals/ + trust/goals
      tools per-repo; `memory/` gitignored.
      probe: `grep -q opsx-compost install.sh` and `grep -q 'memory/' .gitignore`.
- [x] 4.2 `index.html` documents the trust ledger + standing goals (cards + recipe rows + prompt note).
      probe: `grep -c 'Per-skill trust ledger\|Standing goals' index.html` >= 2; tags balanced.

## 5. Guard

- [x] 5.1 All tool tests pass and no pi load-breakers introduced.
      probe: `bun test tools/` all pass; `just check-extensions` exits 0.

## 6. Deferred — the autonomy frontier (NOT in scope)

- [ ] 6.1 Cron heartbeat + cheap-triage economics + unattended shipping driven by the trust
      ledger. Requires an API-key-not-OAuth billing guardrail first (subscription-billing risk).
      probe: a billing guardrail is in place AND a cron run bills to API key, before any autonomous ship.
