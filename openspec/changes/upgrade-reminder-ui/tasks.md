# Tasks — upgrade-reminder-ui

> Built + verified directly this session; evidence in review-log.md.

## 1. Themed widget reminder

- [x] 1.1 opsx-reminder pins pending actions via setWidget (aboveEditor) + setStatus, clears
      both when clean, all fire-and-forget; stderr fallback kept.
      probe: synthetic session_start pins the widget with the /opsx-retro line when pending; clears (undefined) when clean.

## 2. Docs + guard

- [x] 2.1 README + index.html document the widget/status behaviour; no load-breakers.
      probe: `grep -q setWidget index.html`; `just check-extensions` clean; `bun build` on opsx-reminder clean.

## 3. Deferred

- [ ] 3.1 Live-pi-load verification of the widget rendering in the midnight-ocean theme in a real pi TUI.
      probe: the reminder panel is visible above the editor in a real pi session, themed.
