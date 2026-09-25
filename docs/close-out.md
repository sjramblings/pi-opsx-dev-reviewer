# Close an openspec change

## Close a completed change

Use the guarded close-out recipe after every task has a recorded PASS verdict and after
`/opsx-retro` has handled recurring findings.

1. Run the retro for the completed change.

   ```bash
   /opsx-retro add-foo
   ```

2. Run the one-command close-out.

   ```bash
   just archive-change add-foo
   ```

The recipe runs `archive-check`, the promotion guard, `openspec archive -y`, and a
markdownlint normalisation pass for promoted specs in that order. A failed stage stops
the sequence, so the change remains under `openspec/changes/`.

### Handle a partial MODIFIED refusal

A partial `## MODIFIED Requirements` block can lose a main-spec description or scenarios:
openspec replaces that requirement rather than merging it. The promotion guard refuses
with `UNSAFE_PARTIAL_MODIFIED` before openspec changes a spec. Its message names the
capability, requirement, and scenarios at risk.

When that refusal names a capability, use the agent-driven intelligent merge only for
that capability. Preserve the unmentioned content in the main requirement, then make
the named delta's `MODIFIED` requirement a complete restatement of the merged
requirement, with its descriptive body and every scenario. Do not inspect or change a
sibling capability. Retry the same close-out command after the restatement.

```bash
just archive-change add-foo
```

Do not move the change directory yourself or run raw `openspec archive` as a close-out
command. The retry runs the guard across every capability before archival.

## Record a reviewer verdict

The main agent records bookkeeping, while the developer subagent authors mutations.
The boundary keeps code, specs, design artifacts, and other judgment-bearing changes in
the delegated path. `force-delegate` continues to block the main agent's `write` and
`edit` tools plus arbitrary shell mutation.

The guard admits exactly two main-agent recipes: `just record-verdict` and `just
archive-change`. Both recipes have pinned names; the guard blocks a bare `just`, every
other recipe, output flags, redirection, environment assignments, and chained mutation.
The narrow channel lets the orchestrator append a transcript-derived verdict and run the
mechanical close-out without granting a general write capability.

Before starting `/opsx-loop`, run pi's `/session` in the same persisted top-level
session. Copy its absolute `File:` path and quote it as the second loop argument. Do not
write a placeholder such as `<session.jsonl>`: the shell interprets it as input
redirection. If `/session` says `In-memory`, stop and start a persisted session instead.

```text
/session
```

```text
/opsx-loop add-foo "/Users/alice/.pi/agent/sessions/--work-repo--/session.jsonl"
```

After the reviewer returns, `/opsx-loop` renders and runs the corresponding two-argument
recipe:

```bash
just record-verdict "add-foo" "/Users/alice/.pi/agent/sessions/--work-repo--/session.jsonl"
```

`record-verdict` reads the latest reviewer `subagent` tool result containing a
`VERDICT:` line from that parent-session JSONL, appends its text byte-for-byte to the
change ledger, and avoids a duplicate through the transcript tool-call identifier. It
runs before the developer ticks the task. The loop protocol requires the absolute `File:` path for
that persisted session and stops for a missing, guessed, or in-memory path. The recorder itself
accepts any readable path, including a relative path, then validates the transcript and
fails without appending when its content is malformed.
