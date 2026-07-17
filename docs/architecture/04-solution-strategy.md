# 4. Solution Strategy

The architecture rests on a small number of fundamental decisions. Each is stated here with
the cost it accepts; the durable records are in section 9.

## Decision: enforce authorization structurally, not by prompt

The main agent is made read-only at the tool-call layer, so the only way it can change code
is to delegate to a subagent (`extensions/force-delegate/index.ts:6`). Roles that must not
write are given no write tool (`agents/reviewer.md:6`).
Consequence: the delegation guarantee holds even when a model ignores its instructions, but
every code change pays a subprocess spawn, and a read-only reviewer physically cannot run a
test or a build — its evidence is inspection, not execution.

## Decision: fail closed on unknown identity

The path gate treats an unidentified, empty, or unparseable agent identity as unsafe and
restricts it, rather than assuming safety (`extensions/architect-scope/index.ts:38`).
Consequence: a future change to how identity is populated fails to blocked, not to
unrestricted write — but the same strictness once blocked a legitimate writer under a
symlinked repository root until the path was resolved through `realpathSync`
(`extensions/architect-scope/index.ts:128`).

## Decision: review across model families

Review runs cross-family, per ADR 0001.
Consequence: the accepted trade-off is configuring two model providers, in exchange for
catching correlated blind spots. See section 9 for the record.

## Decision: separate the architecture writer from the technical writer

Architecture documentation has a dedicated owner, per ADR 0002.
Consequence: the accepted trade-off is a sixth agent and a second documentation gate, in
exchange for one owner per artifact and an intact Diátaxis discipline. See section 9 for the
record.
