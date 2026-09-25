# Design: session-start learning injection

## Scope

This design settles task 6.1 only. Regression blocking, pruning, and the separate 6.4
verification task remain out of scope.

## Session-start changed-file source

`learnings-inject` derives one canonical, repository-relative file set at `session_start`:

1. Resolve the repository root with `git rev-parse --show-toplevel`.
2. Resolve a comparison ref in this fixed order: `origin/main`, `upstream/main`, local
   `main`, `origin/master`, `upstream/master`, local `master`. The
   `LEARNINGS_INJECT_BASE` environment variable is an explicit override.
3. Compute the merge base of `HEAD` and that ref.
4. Take the sorted, deduplicated union of:
   - committed branch paths from merge-base through `HEAD`;
   - staged and unstaged paths relative to `HEAD`; and
   - untracked, non-ignored paths.

Renames are disabled for the Git diff so both affected paths remain eligible for glob
matching. The extension passes this file list on standard input to
`tools/select-learnings.ts`; it does not reimplement status filtering, ordering, or the
result cap.

A successful derivation with zero paths is a known cold start. The selector still runs and
its clear `No relevant learnings` result is injected with `status: scope-derived-empty`.
If the repository, comparison ref, merge base, or any Git command cannot be resolved, the
extension injects `status: SCOPE UNKNOWN` and does not call the selector. Selector launch or
output failure is separately injected as `status: RETRIEVAL ERROR`. Therefore a derivation
failure cannot masquerade as a healthy empty match.

## Injection and guard alignment

The extension sends a displayed custom pi message. Custom messages participate in model
context, so the bounded selector output is available to the next turn without triggering a
turn on its own. All child processes are read-only Git queries or the existing selector;
the extension writes no artifact and does not conflict with the force-delegate or artifact
ownership guards.

The source file follows the pi loader constraints: no literal patterns, raw backtick
characters, or apostrophes. `just check-extensions` scans it through the existing wildcard
layout, and the extension has a focused session-start test for matched, known-empty, and
unknown-scope behavior.
