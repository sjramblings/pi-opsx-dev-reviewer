# Global invariants

This file contains only global, always-on, unscoped invariants; cap it at about 60 lines and prune any line that is no longer earned by a real failure.

- Never assert that a diff is empty, a file untouched, or a task a no-op without pasting the `git diff --name-only` (or equivalent) command output that proves it -- the reviewer treats an unproven state claim as a failed evidence check.
