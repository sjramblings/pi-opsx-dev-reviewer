---
description: Distil a completed change's review findings into durable rules before archiving (the ratchet).
argument-hint: "<change-name>"
---

# Archive-time retro — ratchet the findings

Change: `$1`

Turn this change's review findings into permanent back-pressure so the next change
is cheaper. Read `openspec/changes/$1/review-log.md`.

1. Group the reviewer findings into recurring classes (same root cause across tasks).
2. For each recurring class, codify it in the most deterministic surface available.
   **Route by one fact / one writable home** (see `learnings/README.md`):
   - Mechanically checkable → a lint rule or test (strongest; prefer this).
   - A per-artifact expectation → a `rules:` entry in `openspec/config.yaml`.
   - A **global, always-on, unscoped** invariant → one line in `AGENTS.md` (keep it under
     ~60 lines total; every line earned by a real failure; prune like code).
   - A rule that applies to **specific paths** → a scoped entry in `learnings/` (copy
     `learnings/_TEMPLATE.md`). Set `scope` to the glob(s) it governs, `source.change: $1`
     and `source.commit` to the change's head sha, and `status: draft`. Do NOT also write
     the same rule to AGENTS.md — scoped rules live only here.
3. **Promotion gate:** a new `learnings/` entry starts `status: draft` and is NOT injected.
   Promote it to `status: active` only with explicit human ack here (or when the same
   pattern is cited by multiple review-log entries). Retire learnings that no longer fire.
4. Propose the edits, get sign-off, then apply them. Run `just learnings-audit` to confirm
   provenance + schema, and `just check-learnings` to confirm the retrieval path is live.
5. Only then `openspec archive $1`.

Report which findings were codified where (lint / config / AGENTS.md / `learnings/`), and
which were one-offs not worth a rule.
