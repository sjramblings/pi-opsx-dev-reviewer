---
name: openspec-sync-specs
description: Intelligently sync one capability after the sanctioned archive path is refused by the promotion guard.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.4.1"
---

# openspec-sync-specs

Sync delta specs from a change to main specs.

The default sanctioned path is `just archive-change <change>`. Invoke this prose skill only when that
command's promotion guard refuses with `UNSAFE_PARTIAL_MODIFIED`, and scope the fallback to the exact
capability named by the guard. This is not a general or pre-emptive sync path.

This is an **agent-driven** operation - you will read delta specs and directly edit main specs to apply the changes. This allows intelligent merging (for example, adding a scenario without copying the entire requirement).

**Input**: Require the change name, the `UNSAFE_PARTIAL_MODIFIED` refusal, and the capability named by
the guard. If any are absent or ambiguous, stop and direct the operator to
`just archive-change <change>`; never infer the capability or broaden the scope.

## Steps

1. **Confirm the promotion-guard refusal**

   Confirm that `just archive-change <change>` failed with `UNSAFE_PARTIAL_MODIFIED` and record the
   exact capability named by the guard. If the command did not reach that refusal, stop and report
   the original failure instead of invoking this skill.

   Handle only the named capability. Do not select, inspect, or sync sibling capabilities.

2. **Resolve change context**

   Run:

   ```bash
   openspec status --change "<name>" --json
   ```

   If status reports `actionContext.mode: "workspace-planning"`, explain that workspace spec sync is not supported in this slice and STOP. Do not fall back to repo-local paths or edit linked repos.

3. **Find the guard-named delta spec**

   Use `artifactPaths.specs.existingOutputPaths` from the status JSON to locate only the delta spec
   for the exact capability named by the guard. Validate that exactly one matching path exists; if it
   is absent or ambiguous, fail with context and make no edits.

   The delta spec contains sections like:
   - `## ADDED Requirements` - New requirements to add
   - `## MODIFIED Requirements` - Changes to existing requirements
   - `## REMOVED Requirements` - Requirements to remove
   - `## RENAMED Requirements` - Requirements to rename (FROM:/TO: format)

   If the named delta spec is not found, inform the user and stop.

4. **Apply the named delta spec to its main spec**

   For the one guard-named, repo-local capability delta spec path returned by the CLI:

   a. **Read the delta spec** to understand the intended changes

   b. **Read the main spec** at `openspec/specs/<capability>/spec.md` (may not exist yet)

   c. **Apply changes intelligently**:

      **ADDED Requirements:**
      - If requirement doesn't exist in main spec → add it
      - If requirement already exists → update it to match (treat as implicit MODIFIED)

      **MODIFIED Requirements:**
      - Find the requirement in main spec
      - Apply the changes - this can be:
        - Adding new scenarios (don't need to copy existing ones)
        - Modifying existing scenarios
        - Changing the requirement description
      - Preserve scenarios/content not mentioned in the delta

      **REMOVED Requirements:**
      - Remove the entire requirement block from main spec

      **RENAMED Requirements:**
      - Find the FROM requirement, rename it to the target name

   d. **Create new main spec** if capability doesn't exist yet:
      - Create `openspec/specs/<capability>/spec.md`
      - Add Purpose section (can be brief, mark as TBD)
      - Add Requirements section with the ADDED requirements

   e. **Make the named delta safe for deterministic promotion** after the intelligent merge:
      - For every MODIFIED requirement in the named delta, replace that partial delta block with the
        complete requirement now present in the resulting main spec, including its descriptive body
        and every scenario
      - Preserve all other delta sections for the named capability exactly
      - If the complete restatement cannot be verified against the resulting main requirement, stop
        with context instead of reporting success

      This final restatement records the intelligently merged result without changing its meaning. It
      allows the promotion guard to verify the named capability when the archive skill retries the
      sanctioned path; it does not permit inspecting or changing sibling deltas.

5. **Show summary**

   After applying the scoped change, summarize:
   - The guard-named capability that was updated
   - What changes were made (requirements added/modified/removed/renamed)
   - That each MODIFIED requirement in the named delta is now a complete, verified restatement
   - That no sibling capability was inspected or modified

## Delta Spec Format Reference

```markdown
## ADDED Requirements

### Requirement: New Feature
The system SHALL do something new.

#### Scenario: Basic case
- **WHEN** user does X
- **THEN** system does Y

## MODIFIED Requirements

### Requirement: Existing Feature
#### Scenario: New scenario to add
- **WHEN** user does A
- **THEN** system does B

## REMOVED Requirements

### Requirement: Deprecated Feature

## RENAMED Requirements

- FROM: `### Requirement: Old Name`
- TO: `### Requirement: New Name`
```text
## Key Principle: Intelligent Merging
Unlike programmatic merging, you can apply **partial updates**:

- To add a scenario, just include that scenario under MODIFIED - don't copy existing scenarios
- The delta represents *intent*, not a wholesale replacement
- Use your judgment to merge changes sensibly

## Output On Success
```text
## Specs Synced: <change-name>

Updated main spec for guard-named capability **<capability>**:

- Added requirement: "New Feature"
- Modified requirement: "Existing Feature" (added 1 scenario)

The named capability is updated, its MODIFIED delta is guard-safe, and sibling capabilities are
untouched. The fallback archive flow may now retry `just archive-change <change>`.
```text
## Guardrails

- Use `just archive-change <change>` as the default sanctioned path
- Enter this prose fallback only after `UNSAFE_PARTIAL_MODIFIED` names the capability
- Read only the named capability's delta and main specs before making changes
- Never inspect or modify a sibling capability through this fallback
- Preserve existing content not mentioned in the delta
- Fully restate the resulting MODIFIED requirements in the named delta before reporting success
- If something is unclear, ask for clarification
- Show what you are changing as you go
- The operation should be idempotent; running twice should give the same result
