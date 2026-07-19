# Pin lifecycle reminders as a themed widget

## Why

`opsx-reminder` fired a one-shot `ctx.ui.notify` at session start — transient, easy to miss,
and gone by the time you act. pi exposes persistent UI surfaces (`setWidget`, `setStatus`)
that render in the active pi theme (e.g. midnight-ocean). A pinned reminder is the "tooltip"
the operator actually sees.

## What Changes

- `opsx-reminder` now pins the pending lifecycle actions as a `setWidget` panel above the
  editor plus a `setStatus` footer badge (both render in the active pi theme), and **clears
  both** when nothing is pending so a stale reminder never lingers.
- Every UI call stays fire-and-forget/best-effort (wrapped, never throws); the stderr banner
  remains as the fallback for clients that ignore UI requests.

## Capabilities

- **New Capabilities**: `reminder-ui`

## Impact

Modified: `extensions/opsx-reminder/index.ts`, README + index.html. Tokenizer-safe; no new
dependency. Widgets are theme-coloured plain-text lines — no per-line colour is set, so the
reminder always matches whatever pi theme is active rather than fighting it.
