# Harden architect-scope to fail closed

## Why
`architect-scope` decides whether the current agent may write by reading the tail of
`PI_SUBAGENT_STACK`. Today an unknown, empty, or unparseable stack means "not the
architect", so the extension no-ops and the agent keeps full write access — it fails
OPEN. A future `@mjakl/pi-subagent` change to how the stack is populated would silently
hand the architect (or any unidentified agent) unrestricted write. The guard must fail
CLOSED: deny writes unless the agent is positively identified as authorized.

## What Changes
- Invert the write decision to default-deny for the design-artifact boundary.
- **BREAKING** for any workflow that relied on architect-scope no-opping for non-architect
  agents — it still no-ops for agents other than `solution-architect` (so the developer
  keeps full tools), but an *unidentified* agent is no longer treated as safe.

## Capabilities
- **New Capabilities**: `architect-scope-enforcement`

## Impact
`extensions/architect-scope/index.ts` only. No other files. Behaviour change is limited to
the `solution-architect` path and the unidentified-agent path.
