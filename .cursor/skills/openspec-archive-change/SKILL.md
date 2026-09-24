---
name: openspec-archive-change
description: Fallback archive workflow for a completed change when the sanctioned path is refused by the promotion guard.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.4.1"
---

# openspec-archive-change

Archive a completed change in the experimental workflow.

The default sanctioned path is `just archive-change <change>`. Invoke this prose skill only when that
command's promotion guard refuses with `UNSAFE_PARTIAL_MODIFIED` and names a capability. The fallback
is limited to the named capability; it is not an alternative general archive path.

**Input**: Require the change name, the `UNSAFE_PARTIAL_MODIFIED` refusal, and the capability named by
the guard. If any are absent or ambiguous, stop and direct the operator to
`just archive-change <change>`; do not infer a fallback trigger or capability.

## Steps

1. **Confirm the promotion-guard refusal**

   Confirm that `just archive-change <change>` failed with `UNSAFE_PARTIAL_MODIFIED` and record the
   exact capability named by the guard.

   If the command did not reach that refusal, stop. Report the original failure instead of bypassing
   it. Handle only the named capability, and never broaden the prose fallback to sibling
   capabilities.

2. **Check artifact completion status**

   Run `openspec status --change "<name>" --json` to check artifact completion.

   Parse the JSON to understand:
   - `schemaName`: The workflow being used
   - `planningHome`, `changeRoot`, `artifactPaths`, and `actionContext`: path and scope context
   - `artifacts`: List of artifacts with their status (`done` or other)

   If status reports `actionContext.mode: "workspace-planning"`, explain that workspace archive is not supported in this slice and STOP. Do not move workspace changes into repo-local archives or edit linked repos.

   **If any artifacts are not `done`:**
   - Display warning listing incomplete artifacts
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

3. **Check task completion status**

   Read the tasks file (typically `tasks.md`) to check for incomplete tasks.

   Count tasks marked with `- [ ]` (incomplete) vs `- [x]` (complete).

   **If incomplete tasks found:**
   - Display warning showing count of incomplete tasks
   - Use **AskUserQuestion tool** to confirm user wants to proceed
   - Proceed if user confirms

   **If no tasks file exists:** Proceed without task-related warning.

4. **Intelligently sync only the refused capability**

   Use `artifactPaths.specs.existingOutputPaths` from status JSON to locate the delta spec for the
   exact capability named by the guard. If that delta does not exist, fail with context; do not
   inspect or substitute another capability.

   Compare only that delta with its main spec at `openspec/specs/<capability>/spec.md`, determine the
   required intelligent merge, and show the capability-scoped summary before prompting to continue
   or cancel.

   If the user continues, use Task tool (subagent_type: "general-purpose," prompt: "Use Skill tool to
   invoke openspec-sync-specs for change '<name>' after promotion-guard refusal
   'UNSAFE_PARTIAL_MODIFIED', scoped only to capability '<capability>'. Intelligently merge the named
   delta into its main spec, then make each merged MODIFIED requirement in that named delta a complete
   restatement of the resulting main requirement so deterministic promotion is guard-safe. Delta spec
   analysis: <include the capability-scoped analysis>"). If sync fails, is cancelled, or cannot make
   the named delta guard-safe, stop without archiving.

5. **Retry the sanctioned archive path**

   After the capability-scoped intelligent merge makes the named delta guard-safe, run exactly:

   ```bash
   just archive-change "<name>"
   ```

   This retries the complete deterministic sequence: archive check, promotion guard across every
   capability (including siblings), openspec CLI promotion and archival, and promoted-spec lint
   normalisation. Do not reproduce or skip any stage.

   If the retry exits non-zero, stop and report the exact failing stage and command output. Do not
   perform a direct filesystem archive or claim a successful result. The command may have failed
   before or after the openspec CLI stage, so report only the state established by its output.

6. **Display the deterministic result**

   Only after the retry succeeds, show an archive completion summary including:
   - Change name
   - schema that was used
   - The actual archive location reported by the openspec CLI
   - The guard-named capability merged by the fallback
   - Note about any warnings (incomplete artifacts/tasks)

## Output On Successful Retry

```text
## Guarded Archive Complete

**Command:** just archive-change <change-name>
**Change:** <change-name>
**Schema:** <schema-name>
**Archived to:** <exact location reported by the successful command>
**Fallback merge:** <guard-named capability only>
```text
## Guardrails

- Use `just archive-change <change>` as the default sanctioned path
- Enter this prose fallback only after `UNSAFE_PARTIAL_MODIFIED` names the capability
- Never inspect or sync sibling capabilities through this fallback
- Use the artifact graph (`openspec status --json`) for completion checking
- Do not block archive on warnings; inform the user and confirm
- Use the openspec-sync-specs intelligent-merge approach only for the guard-named capability
- Make the named delta guard-safe, then retry `just archive-change <change>` as the only terminal
  archive operation
- Never archive directories directly or infer success after a non-zero retry
