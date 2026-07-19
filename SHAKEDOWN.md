# Shakedown log

What the first live run of the harness surfaced. This is the dogfood from Phase 4 of
[`HARDENING_PLAN.md`](HARDENING_PLAN.md), run against pi 0.79.9 on 2026-07-08.

## Headline finding: the enforcer extensions were dead on arrival

The first live `pi` run tried the README "Force proof" — ask the main agent to write a
file with `force-delegate` active; it should be blocked. **It was not blocked.** The file
was written every time.

The central safety mechanism of the kit did not work at all as shipped. Every offline
check had passed: `bun build --no-bundle` was clean, a direct `jiti` import returned a
valid function, and 29 hand-written unit cases were green. None of them exercised pi's
actual extension loader.

## Root cause: pi 0.79.9 has a fragile extension tokenizer

pi loads `.ts` extensions through a tokenizer that fails the whole file with
`ParseError: Unterminated string constant` and then **silently disables the extension**
(extension load errors are logged-and-continue). Three constructs trigger it:

1. **Regex literals.** `const DANGEROUS = /[...]/;` breaks the parse. The known-good
   community extensions (e.g. `damage-control.ts` in `pi-vs-claude-code`) use
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
agent reports "the harness blocked direct writes and required delegation", and the file is
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
