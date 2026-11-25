---
slug: season-book-board-reads
title: "Season Book Board Freshness, Busy Gate, and Account Scope"
domain: ui
kind: subcard
parent: season-book-laurel-window-overview
files:
  - src/ui/seasonBookHost.js
  - src/ui/enhancedSeason.js
  - src/net/accountClient.js
  - src/arena/arenaOnline.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Season-Book.md"
related:
  - season-book-laurel-window-overview
  - door-token-ahead-mint-and-arena-online-wait
invariants:
  - "A board is asked only when the window opens, at most once per `SEASON_BOARD_FRESH_MS` (60000), unless `askedFor` differs from `season`."
  - "No board is asked while BUSY-GATE holds (busyUntil() > Date.now())."
  - "Each answer belongs to the account signed in when it was asked (me()). A board from another account triggers a fresh ask."
traps:
  - "The arena board is read only while arena.live() is true. The arena keeps its own 20 s cadence."
dfu: []
tags:
  - season
  - boards
  - busy-gate
  - account
---

# Season Book Board Freshness, Busy Gate, and Account Scope

The Season Book host throttles competitive board requests to window-open events, respects the account busy gate, and scopes cached answers to the active account and season.

- **Board mapping and freshness window (`src/ui/seasonBookHost.js`, `src/ui/enhancedSeason.js`):** `SEASON_BOARDS` maps `spire` to `eg`, `iliac` to `iliac`, and `gambit` to `gambit`. When the window opens, `seasonSource(hooks, { opening })` passes `ask: opening` to the timers clock and queries boards only on open. Each board is asked at most once per `SEASON_BOARD_FRESH_MS` (`60000` ms) unless its cached `askedFor` key differs from the current `season`.
- **Busy gate and account scope (`src/ui/seasonBookHost.js`, `src/net/accountClient.js`):** No board is asked while the busy gate holds (`busyUntil() > Date.now()`). Each answer is bound to the account signed in when asked (`me()`), so a board cached under another account triggers a fresh ask on open.
- **Online arena cadence (`src/arena/arenaOnline.js`):** The arena board is read only while `arena.live()` is true, and the online arena keeps its own 20-second refresh cadence.
