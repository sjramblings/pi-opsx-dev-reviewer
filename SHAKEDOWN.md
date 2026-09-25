# Shakedown log

What the first live run of the harness surfaced. This is the dogfood from Phase 4 of
[`HARDENING_PLAN.md`](HARDENING_PLAN.md), run against pi 0.79.9 on 2026-07-08.

## Headline finding: the enforcer extensions were dead on arrival

The first live `pi` run tried the README "Force proof"—ask the main agent to write a
file with `force-delegate` active; it should be blocked. **It was not blocked.** The file
was written every time.

The central safety mechanism of the kit did not work at all as shipped. Every offline
check had passed: `bun build --no-bundle` was clean, a direct jiti import returned a
valid function, and 29 hand-written unit cases were green. None of them exercised pi's
actual extension loader.

## Root cause: pi 0.79.9 has a fragile extension tokenizer

pi loads `.ts` extensions through a tokenizer that fails the whole file with
`ParseError: Unterminated string constant` and then **silently disables the extension**
(extension load errors are logged-and-continue). Three constructs trigger it:

1. **Regex literals.** `const DANGEROUS = /[...]/;` breaks the parse. The known-good
   community extensions (for example `damage-control.ts` in `pi-vs-claude-code`) use
   `new RegExp("...")` exclusively for exactly this reason.
2. **Raw backticks.** A backtick inside a regex character class, and backticks in
   comments, are read as template-literal starts.
3. **Apostrophes.** A single `'` anywhere -- including inside `//` comments and inside
   double-quoted strings (`"'developer' subagent"`) -- is treated as a string delimiter.
   An odd count produces the hard `Unterminated string constant` error; an even but
   mis-paired count parses without error but corrupts the affected string constants, so
   the extension loads and its handler runs but the returned block object is malformed.

`force-delegate` and `architect-scope` had all three.

## The false-negative that nearly hid the fix

After removing the load-breakers, the write STILL appeared to succeed -- but for a
different reason. With a working `force-delegate`, the main agent is blocked, so it
**delegates to the developer subagent**, and the subagent (running at depth > 0, where the
extension no-ops) does the write. The file existing is delegation working, not the guard
failing. Verifying "did the file get created" measured the wrong thing.

The correct probe runs with the delegate fallback removed:

```text
pi -p -a --exclude-tools subagent "use the write tool to create /tmp/x with PROOF"
```

With no subagent to delegate to, a blocked main agent cannot write at all. Result: the
agent reports "the harness blocked direct writes and required delegation," and the file is
never created. `rm` via bash is likewise blocked; a read-only `echo` runs directly. All
three now pass.

## Fixes applied

- Rewrote both extensions with `new RegExp(...)`, zero backticks, zero apostrophes.
- Inverted `architect-scope` to fail closed (change 1.1): an unidentified agent is now
  restricted, not unrestricted.
- Added `just check-extensions` -- a mechanical guard that fails on any regex literal,
  backtick, or apostrophe in an extension. This is the regression gate the unit tests
  could not be, because the defect lived in pi's loader, not in the logic.

## Lessons for the harness (fed back into the plan)

- **A green offline suite is not evidence the extension loads in pi.** The only real
  probe is loading it through `pi` itself. This is the operating-risks "manufactured
  rigor" thesis, proven on the harness's own foundation.
- **Verify the guard by removing the fallback, not by checking the side effect.** The
  subagent legitimately performs delegated writes; measure whether the main agent was
  blocked, not whether the artifact appeared.
- **pi extension source has hard lexical constraints** (no regex literals, backticks, or
  apostrophes) that no general TypeScript tool enforces. `check-extensions` encodes them.

## Bookkeeping channel live shakedown—2026-07-30

Task 3.2 of `add-orchestrator-bookkeeping` was exercised through a real pi 0.80.10 main
session, not through the extension unit harness. The child pi process was launched with
`PI_SUBAGENT_DEPTH` and `PI_SUBAGENT_STACK` removed so it did not inherit the developer
subagent identity, and with the `subagent` tool excluded so a blocked main-agent call
could not be delegated.

### Install and fixture preconditions

`./install.sh --here` copied all seven guard directories into `.pi/extensions/`, then
exited 1 when its tools copy reached source and destination paths that were identical:

```text
→ Installing project-scoped harness into ~/GitHub/projects/pi-opsx-dev-reviewer
  · extensions → .pi/extensions/ (7 guards)
cp: ~/GitHub/projects/pi-opsx-dev-reviewer/tools/select-learnings.ts and ~/GitHub/projects/pi-opsx-dev-reviewer/tools/select-learnings.ts are identical (not copied).
Command exited with code 1
```

The required guard copy had already completed. The installed and source copies were
then compared byte-for-byte and the loader gate was run:

```text
$ cmp extensions/force-delegate/index.ts .pi/extensions/force-delegate/index.ts && cmp extensions/harness-selftest/index.ts .pi/extensions/harness-selftest/index.ts && echo 'guard copies: byte-identical' && just check-extensions
guard copies: byte-identical
recipe-thinness: record-verdict clean -- contracted wrapper only
recipe-thinness: archive-change clean -- contracted wrapper only
check-extensions: clean -- no pi load-breakers; recipe-thinness assertions clean
```

The admitted recipes used the disposable change
`zz-shakedown-bookkeeping-20260730-3-2`. Its recorder input was the committed fixture
`tools/fixtures/session-with-verdicts.jsonl` (SHA-256
`e90d52c2c97164356dae1a7adb32953ffb7b6795b3c92f01188e5469e92580c2`). The disposable
change had no delta specs, so successful archival could not promote or alter a main
spec. `just archive-check zz-shakedown-bookkeeping-20260730-3-2` passed before the live
session.

### Real pi session

```text
COMMAND: env -u PI_SUBAGENT_DEPTH -u PI_SUBAGENT_STACK PI_SKIP_VERSION_CHECK=1 pi --mode json -a --session-dir /tmp/pi-opsx-task-3.2-live-sessions.LK57SN --name task-3.2-live-20260730T-shakedown --exclude-tools subagent --provider openai-codex --model gpt-5.4-mini --thinking low @/tmp/pi-opsx-task-3.2-live-prompt.md Execute\ the\ attached\ controlled\ shakedown\ now.
PI_EXIT=0
SESSION_FILE=/tmp/pi-opsx-task-3.2-live-sessions.LK57SN/2026-07-30T22-37-07-084Z_019fb52c-9a8c-7637-b922-52ce44af1fc2.jsonl
SESSION_ID=019fb52c-9a8c-7637-b922-52ce44af1fc2
SESSION_SHA256=ecebbf7daef97611c445ba0b06d2e08ba944c4b3ee7899529ec160fb39f466c7
```

The final stderr contained only the existing reminder and no self-test halt:

```text
----- opsx-reminder -----
-> 4 draft learning(s) awaiting promotion

$ grep -F 'HARNESS UNGUARDED' /tmp/pi-opsx-task-3.2-live.stderr.Ic2rX3
HARNESS_UNGUARDED_GREP_EXIT=1 (1 means absent)
```

Relevant session records, in execution order:

```text
write {"path":"/tmp/pi-force-delegate-main-write-probe-3-2.txt","content":"MAIN_AGENT_WRITE_MUST_NOT_LAND"}
ERROR: architect-scope: writes are restricted to design artifacts (proposal.md, design.md, specs/**, docs/decisions/**) for the solution-architect and for any unidentified agent. This path is production code or tests -- hand the change to the developer subagent.

bash {"command":"rm -f /tmp/pi-force-delegate-main-write-probe-3-2.txt"}
ERROR: force-delegate: the main agent may only run read-only orchestration or the pinned just archive-change and just record-verdict bookkeeping recipes via bash. This command can mutate or could not be parsed inside that bounded channel -- delegate it to the developer subagent instead.

bash {"command":"just record-verdict zz-shakedown-bookkeeping-20260730-3-2 tools/fixtures/session-with-verdicts.jsonl"}
record-verdict: appended: task 1.1

bash {"command":"just archive-change zz-shakedown-bookkeeping-20260730-3-2"}
docs-contracts: clean
archive-check: review ledger present (2 verdict(s)).
promote-guard: safe: checked 0 MODIFIED requirement(s) across 0 capability delta(s)
Change 'zz-shakedown-bookkeeping-20260730-3-2' archived as '2026-07-30-zz-shakedown-bookkeeping-20260730-3-2'.
archive-change: no promoted spec files to lint-normalise.

bash {"command":"just deploy"}
ERROR: force-delegate: the main agent may only run read-only orchestration or the pinned just archive-change and just record-verdict bookkeeping recipes via bash. This command can mutate or could not be parsed inside that bounded channel -- delegate it to the developer subagent instead.
```

The blocked write target remained absent. After evidence capture, both the active and
archived disposable change paths were removed; the actual change and review ledger were
not used by either admitted recipe.

### Real block-event evidence

Before preparation, `memory/tool-events.jsonl` had 239 lines and zero
`force-delegate` records. A first wrapper attempt containing a recursive cleanup command
was blocked by `developer-guard`, taking the file to 240 lines without starting pi. The
real pi session then took it from 240 to 243 lines: one main-agent write block from
`architect-scope` and these two main-agent `force-delegate` blocks:

```json
{"ts":"2026-07-30T22:37:12.467Z","agent":"main","guard":"force-delegate","tool":"bash","reason":"force-delegate: the main agent may only run read-only orchestration or the pinned just archive-change and just record-verdict bookkeeping recipes via bash. This","target":"rm -f /tmp/pi-force-delegate-main-write-probe-3-2.txt"}
{"ts":"2026-07-30T22:37:20.067Z","agent":"main","guard":"force-delegate","tool":"bash","reason":"force-delegate: the main agent may only run read-only orchestration or the pinned just archive-change and just record-verdict bookkeeping recipes via bash. This","target":"just deploy"}
```

## Worktree-isolation live shakedown—2026-08-02

Task 5.1 of `add-worktree-isolation` ran against the shipped pi 0.83.0 binary. The real
repository was intentionally dirty, so creating worktrees from its current `HEAD` would
have omitted the uncommitted delivery. The probe did not stage, commit, reset, or clean
that repository. Instead, it copied the current working-tree deliverables—excluding
`.git/`, `.pi/`, `memory/`, `node_modules/`, build output, and ephemeral caches—into
`/tmp`, initialized and committed that disposable fixture, and exercised the exact
shipped recipes there.

The fixture-global install used an isolated `PI_CODING_AGENT_DIR` and a harmless
`pi install` stub; every runtime probe invoked the real absolute pi 0.83.0 binary. Every
top-level process started with `PI_SUBAGENT_DEPTH`, `PI_SUBAGENT_STACK`, and the
force-delegate handshake unset. No model request or network access was required.

### Outcomes

- Exact `just worktree alpha` and `just worktree beta` calls created sibling paths on
  `session/alpha` and `session/beta`. Both had all local guards and `lib`, shared the
  fixture primary's `memory/` through symlinks, and excluded the global-only canary.
- Concurrent real RPC sessions ran as processes 72831 and 72832. Their observer commands
  validated current-PID handshakes, distinct working directories and session names, and
  cwd-relative OpenSpec status for `add-hld-war-assessment` and
  `add-structurizr-diagram-option`.
- In alpha, `force-delegate` and the local duplicate consumer `harness-selftest` were
  moved outside extension discovery, leaving the installed global canary as the sole
  handshake consumer. The real pi process exited 1 synchronously with `HARNESS
  UNGUARDED`; queued RPC `bash` and `export_html` mutations created neither sentinel.
  Restoring both local guards produced another validated, exit-0 RPC session.
- Two synchronized Bun CLI processes wrote distinct trust results through the worktree
  memory symlinks. Both final rows remained in primary `memory/trust.tsv`; no lock or
  atomic-write temporary artifact remained.
- Each worktree created an untracked proof only below its assigned, different
  `openspec/changes/<name>/` folder. Its own proof was present and the opposite proof
  absent; each `openspec status --change` resolved its own worktree root. Both proofs
  were removed before worktree removal.
- Exact `just worktree-rm alpha` and `just worktree-rm beta` calls removed both sibling
  directories and registrations. The fixture primary's memory sentinel, trust rows,
  and committed object `36f298fc01418b7993b1541589092c10936dba02` survived.

The retained transcript contains every shakedown command, merged raw output, explicit
exit code, RPC JSON, persisted stderr halt, helper source, and shape assertions:
`openspec/changes/add-worktree-isolation/probes/5.1-live-shakedown.txt` (SHA-256
`72f428199fdd42dc9ddb7d364022e4ca442b7091b2edbd7b16f8861350182abb` after the operator home path was replaced with `~` on 2026-09-25 for
publication; the transcript as captured hashed to `5ba0a03197b8827c85ca26bce429cca5d40cad518bc27087edc8956d4b134fea`).

## pi 0.83.0 loader probe—2026-09-24

Purpose: check whether the 0.79.9 load-breaker defect still reproduces, and prove the new
`repeat-call-detector` and the edited `architect-scope` load through pi itself, not only under
`bun test`. The probe imports pi's own `loadExtensions` from the installed package
(the core extensions loader inside the globally installed `@earendil-works/pi-coding-agent`, pi
`--version` 0.83.0) and loads each file with no model and no network.

Probe file, containing both 0.79.9 load-breakers (a regex literal and an apostrophe):

```text
export default function (pi) { const r = /x/; pi.on("tool_call", async () => undefined); } // it's
```

Outcomes:

- The probe file: `errors: []`, one `tool_call` handler registered. The defect does not
  reproduce on 0.83.0.
- `extensions/repeat-call-detector/index.ts`: `errors: []`, one handler; with
  `OPSX_REPEAT_CALL_LIMIT=3`, three identical `bash` calls returned `[false,false,true]`
  (the third blocked).
- `extensions/architect-scope/index.ts` after the argument-hardening edit: `errors: []`, one
  handler.

The load-breaker rules in `just check-extensions` stay, because the kit declares no minimum pi
version.
