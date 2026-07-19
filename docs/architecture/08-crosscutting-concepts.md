# 8. Crosscutting Concepts

Each pattern below names its catalogue, the repository location that instantiates it, and at
least one consequence the system accepts by using it.

## Pattern: Fail-safe defaults (default-deny authorization)

Catalogue: Saltzer and Schroeder, *The Protection of Information in Computer Systems*
(fail-safe defaults). Instantiated in the path gate, which restricts any unidentified agent
rather than allowing it (`extensions/architect-scope/index.ts:38`) and in the bash gate,
which blocks a command it cannot parse with confidence
(`extensions/force-delegate/index.ts:13`).
Consequence: the system accepts that legitimate-but-unrecognized actions are blocked — a
symlinked repository root once blocked a valid write until the path resolution fix
(`extensions/architect-scope/index.ts:128`), and an unparseable-but-harmless bash command is
refused.

## Pattern: Least privilege via process isolation

Catalogue: Saltzer and Schroeder (least privilege). Instantiated by giving each agent only
the tools its role needs — the review roles hold no write or bash tool
(`agents/reviewer.md:6`, `agents/spec-reviewer.md:6`) — enforced by separate pi processes per
subagent (`extensions/force-delegate/index.ts:15`).
Consequence: the system accepts a per-delegation process-spawn cost, and a read-only
reviewer cannot execute a test or build, so its verdict rests on inspection rather than
running the code.

## Pattern: Dead-man's-switch canary

Catalogue: fail-fast health-check (release-engineering canary). Instantiated by
harness-selftest, which halts the session when the force-delegate load handshake is absent
(`extensions/harness-selftest/index.ts:28`).
Consequence: the system accepts that startup depends on an environment handshake — a false
negative in the handshake would halt an otherwise healthy session.

## Pattern: Append-only ledger (ratchet)

Catalogue: event sourcing / append-only log. Instantiated by the review-report artifact,
where each verdict is appended before a task is ticked
(`openspec/schemas/dev-reviewer/schema.yaml:68`), and by the shared tool-events audit trail.
Consequence: the system accepts that a ledger can go stale relative to the code it records —
an attested probe output drifted from the current tool behaviour and had to be flagged for
re-attestation.

## Pattern: Three-state graceful-skip gate

Catalogue: house convention (no external catalogue). Instantiated by the lint gates, which
report `FAIL`, `PARTIAL`, or `clean`, and report `clean` only when every tool ran
(`justfile.opsx:7`, `justfile.opsx:44`).
Consequence: the accepted trade-off is that a machine which omits the gate tools reports
`PARTIAL` rather than `clean`, so a local run yields a weaker signal than CI.
