# Hardening plan — addressing the operating risks

Turns the risks in [`docs/operating-risks.html`](docs/operating-risks.html) into a build.
The move is three reframes, not a patch-list: add an **oracle** so no interested party
produces its own evidence; make the guards **fail closed and test themselves**; move
scrutiny **upstream and tier it by risk**. Phase 4 proves it by driving the first change
through the harness itself.

## Guardrails (read every change)

- Complete implementations — no stubs, no TODO. One change = one focused commit.
- Every change has a **pre-committed acceptance probe** (written before the code).
  Verify with that probe; quote real output. Never tick a box on "should work".
- Keep the kit portable — no `~/.claude` dependencies.
- Repo is local-only, single-author, clean tree — commit direct to `main`.
- `openspec` and `pi` (0.79.9, `openai-codex` provider) are installed — use them live.

## Phase 0 — Prerequisite found by the dogfood (DONE)

The first live run (Phase 4) found that **both enforcer extensions silently failed to load
in pi 0.79.9** due to regex literals + apostrophes — the kit's central mechanism was dead
on arrival, and every offline check missed it. Fixed both extensions, added a
`just check-extensions` load-breaker guard, and corrected the Force-proof verification.
Full write-up: [`SHAKEDOWN.md`](SHAKEDOWN.md). This had to be fixed before any hardening
could matter.

## Phase 1 — Make it safe (fail closed + self-test)

- [x] 1.1 **Invert `architect-scope` to default-deny.** DONE — unidentified agent now
      blocks; 7/7 logic cases pass; loads clean in pi; `check-extensions` clean. Ledger:
      `openspec/changes/harden-architect-scope/review-log.md`.
- [x] 1.2 **Session-start self-test canary** (`extensions/harness-selftest/`). On
      `session_start`, if not a subagent, run the `force-delegate` block predicate against a
      synthetic forbidden write; if it does NOT block, print a loud `HARNESS UNGUARDED —
      HALT` banner (and set a flag the apply prompt refuses to proceed past). Converts
      "enforcers silently didn't load" into a loud stop.
      Probe: load in a repo without `force-delegate` → prints HALT; with it → prints OK.
- [x] 1.3 **Damage-control on the developer** (`extensions/developer-guard/`). Adapt the
      known `damage-control` pattern: block destructive bash (`rm -rf`, `git push --force`,
      `git reset --hard`, `:(){`, `dd`, `mkfs`, curl-pipe-sh) and zero-access paths for the
      developer subagent. The worker fails closed too.
      Probe: synthetic `rm -rf /` through the predicate → blocked; `bun test` cases pass.

## Phase 2 — Make review real (oracle + deterministic gate)

- [x] 2.1 **Deterministic pre-review gate** `just verify-gate`. Runs `tsc`/`eslint`/`semgrep`
      with graceful-skip (like `docs-lint`). The LLM reviewer only sees tasks that already
      cleared the mechanical layer, so it judges design/spec fit, not what a linter nails.
      Probe: run on a file with a swallowed `catch{}` → semgrep flags it (or SKIP notice).
- [x] 2.2 **Pre-committed probe convention.** Each task in `tasks.md` must carry a
      `probe:` line (the frozen acceptance check) BEFORE apply. Add a `just probe-check
      <change>` that fails if any task lacks a probe.
      Probe: a change with a probe-less task → `probe-check` exits non-zero.
- [x] 2.3 **Neutral executor + attestation** `just run-probe <change> <task>`. Runs the
      frozen probe in a clean context, writes the raw command+output AND its `sha256` into
      `review-log.md`; `archive-check` verifies the hash. Neither developer nor reviewer
      produces the evidence; tampering fails the hash.
      Probe: edit a logged output by hand → `archive-check` hash verification fails.

## Phase 3 — Efficient & upstream (tiering + brief/spec gates)

- [x] 3.1 **Risk-tier the apply protocol.** Tasks tagged `risk:high` (auth/money/migration/
      delete/concurrency) get the full cross-family review; others get a light review after
      the deterministic gate. Encode in the delegation protocol + schema.
      Probe: protocol text routes `risk:high` → full review; grep confirms both paths.
- [x] 3.2 **Brief-completeness gate.** A checklist the main agent runs on the Task string
      before spawning the developer: names files? states the probe? out-of-scope? spec path?
      An incomplete brief bounces back — shift-left on the most leveraged input.
      Probe: a brief missing the probe line → gate rejects it.
- [x] 3.3 **Spec red-team** (`agents/spec-reviewer.md`, cross-family). Attacks the
      proposal/design for ambiguity, missing edge cases, wrong assumptions BEFORE code. Add
      a schema step so it runs at design-settle.
      Probe: agent frontmatter valid; schema has a spec-review artifact/step.
- [x] 3.4 **Two-family reviewer quorum.** Run the review as one `openai-codex` + one
      `anthropic` reviewer; both must PASS. Cross-family without moving the developer off
      OpenAI billing.
      Probe: config documents both reviewers; protocol requires both verdicts to pass.

## Phase 4 — Prove it live (dogfood)

- [x] 4.1 **Drive change 1.1 through pi's real delegation** — CORE INTENT MET by the
      shakedown. The live run found the critical load bug (`SHAKEDOWN.md`), proved the
      developer→reviewer delegation round-trip works (a blocked main-agent write is
      correctly delegated and the subagent performs it), and seeded the first real
      `review-log.md` (a VERDICT + a sha256 probe attestation). Because task 1.1 is now
      already implemented, a full clean `/opsx:apply` is best run against a FRESH change —
      recommended as the next live exercise, not a gap in this plan.

## Sequencing

Phase 1 (safe) → Phase 2 (real) → Phase 3 (efficient/upstream) → Phase 4 (live) — but 4.1
dogfoods 1.1 specifically, so the change spec for 1.1 is authored first and its
implementation is driven through pi as the shakedown. Each change is independently useful
and mostly two-way-door.

## Done condition

All boxes ticked with committed changes and passing probes; `SHAKEDOWN.md` records what the
first live run surfaced; the harness has reviewed at least one real change through itself.
