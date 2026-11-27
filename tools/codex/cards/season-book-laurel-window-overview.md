---
slug: season-book-laurel-window-overview
title: "Season Book Laurel Window and Tap-Swallow Handoff"
domain: ui
kind: overview
parent: null
files:
  - src/ui/enhancedSeason.js
  - src/ui/seasonBook.js
  - src/ui/seasonBookHost.js
  - src/scenes/world.js
  - src/net/chatCommands.js
  - src/ui/enhancedOverlays.js
  - src/ui/enhancedMenu.js
  - src/ui/enhancedStyle.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Season-Book.md"
related:
  - season-book-board-reads
  - ui-overlays-and-localization
  - arena-colosseum-overview
  - seats-fortifications-and-seasons
invariants:
  - "The `/season` or `/seasons` chat line opens the window locally and is never sent (pauseCommandOf)."
  - "Without the relay clock (timersSource), `/season` answers pauseCommandRefusal('season'): \"The server clock is not available yet. Go online, or try again in a moment.\""
  - "seasonBookModel builds rows from the boards. The window ticks every SEASON_TICK_MS = 1000."
  - "swallowTapClick eats the next click after a window closes on its press. A new pointerdown or TAP_CLICK_MS = 700 ends the watch."
  - "handoff() captures onAction before the face unmounts."
traps:
  - "Times use Intl (seasonWhenText) and fall back to the English localWhenText when Intl is missing."
  - "The scrim on the pause face does not swallow. Its click belongs to the game."
dfu: []
tags:
  - season
  - laurel
  - pause
  - ui
  - input
  - gamepad
  - touch
---

# Season Book Laurel Window and Tap-Swallow Handoff

The Season Book window displays seasonal standings and countdowns across competitive boards, opened from the pause-face laurel button or via local chat commands.

- **Chat entry and clock guard (`src/net/chatCommands.js`, `src/scenes/world.js`, `src/ui/seasonBookHost.js`):** `/season` and `/seasons` resolve locally via `pauseCommandOf` and never transmit to chat. Without the relay clock (`timersSource`), `/season` returns `pauseCommandRefusal('season')` (`"The server clock is not available yet. Go online, or try again in a moment."`). In `world.js`, `createSeasonBook` wires `arena`, `eg`, `iliac`, `gambit`, and `ledger`.
- **Model, localization, and layout (`src/ui/seasonBook.js`, `src/ui/enhancedSeason.js`, `src/ui/enhancedStyle.js`):** `seasonBookModel` builds board rows using title gates `SEASON_TITLE_GAMES` (`10`) and `SEASON_TITLE_FOES` (`5`), ticking every `SEASON_TICK_MS` (`1000`). `seatSeasonTitle`, `seasonWhenText` (`Intl` with `localWhenText` fallback), and `seasonLeftText` format localized strings. `.px-seasonwin .sb-door` keeps `min-height: 44px` alongside the portrait-phone rule for the four marks.
- **Handoff and tap swallowing (`src/ui/enhancedMenu.js`, `src/ui/enhancedOverlays.js`):** `handoff()` captures `onAction` before the pause face unmounts. `swallowTapClick` eats the next click after a press-close until a new `pointerdown` or `TAP_CLICK_MS` (`700`), while the pause scrim passes clicks to the game.
