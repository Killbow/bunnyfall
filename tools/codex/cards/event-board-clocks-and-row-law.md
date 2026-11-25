---
slug: event-board-clocks-and-row-law
title: "Event Board Clocks, Row IDs, and News Joining"
domain: world-events
kind: subcard
parent: event-board-clocks-and-routing-overview
files:
  - src/worldEvents/eventBoard.js
  - src/worldEvents/eventNotices.js
  - src/systems/starfall/starfallClient.js
  - src/worldEvents/raidingParties.js
  - src/ui/eventBoard.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Event-Board.md"
related:
  - event-board-clocks-and-routing-overview
  - starfall-overview
  - raiding-parties-day-roll-and-spawning
  - event-board-notice-door-and-news-toasts
invariants:
  - "Notices carry an event id via `eventNotice(kind, text, id)`; kinds in `EVENT_SINGLE_KINDS` need no id."
  - "`newsRowOf` never attaches a notice to the row of another event."
  - "Rows carry `since`; news older than `EVENT_SEED_GRACE_MS` before first read is filtered."
traps:
  - "Stars beyond `STAR_WARN_MS` are named without town/pixel."
dfu: []
tags:
  - events1
  - timers
  - starfall
  - raids
---

# Event Board Clocks, Row IDs, and News Joining

`src/worldEvents/eventBoard.js` and `src/worldEvents/eventNotices.js` join incoming news notices to active timer rows by event identifier and gate announcements against look-ahead and seed-grace clocks (`src/ui/eventBoard.js`).

## Event Identifiers, Toast Joins, and Producer Clocks

- **Row identifiers and notice joining (`eventNotice`, `newsRowOf`):** Producers emit notices via `eventNotice(kind, text, id)`. Multi-instance kinds pass an explicit event id so `newsRowOf` never attaches a notice to the row of another event, whereas singleton kinds in `EVENT_SINGLE_KINDS` need no id. Only `EVENT_TOASTS_SHOWN = 1` toast card shows at a time, and each joined note receives at least `EVENT_NOTE_MIN_MS = 5000` (`5` s) of display time.
- **Seed-grace filtering (`EVENT_SEED_GRACE_MS`):** Every row carries a `since` timestamp. On initial world read, news whose `since` timestamp is older than `EVENT_SEED_GRACE_MS = 5000` (`5` s) before first read is filtered out so pre-existing events do not raise stale birth toasts.
- **Raid and starfall clocks (`src/worldEvents/raidingParties.js`, `src/systems/starfall/starfallClient.js`):** The board keeps events that are live or start within `EVENT_SOON_MS = 15 * 60_000` (`15` min). In `src/worldEvents/raidingParties.js`, `raidTimerList` looks ahead `EVENT_SOON_MS` before day turn, and `raidRegionNow` gates raid announcements. In `src/systems/starfall/starfallClient.js`, `starTimerRows` builds star rows; stars beyond `STAR_WARN_MS = 10 * 60_000` (`10` min) before landing omit town and map pixel.
