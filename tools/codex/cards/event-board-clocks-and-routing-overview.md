---
slug: event-board-clocks-and-routing-overview
title: "Event Board Clocks, Row Joins, and HUD Routing"
domain: world-events
kind: overview
parent: null
files:
  - src/worldEvents/eventBoard.js
  - src/ui/eventBoard.js
  - src/worldEvents/eventNotices.js
  - tools/eventBoardProbe.mjs
  - src/ui/hud.js
  - src/ui/enhancedHud.js
  - src/ui/enhancedStyle.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Event-Board.md"
related:
  - event-board-hud-overview
  - event-board-notice-door-and-news-toasts
  - event-board-plate-layout-and-filters
  - event-board-clocks-and-row-law
invariants:
  - "Row law lives in `src/worldEvents/eventBoard.js`; DOM placement lives in `src/ui/eventBoard.js`."
  - "Event producers are wired from `src/scenes/world.js`."
  - "`eventBoardPlace` drops rows or stands the plate down when space is short; news then goes to the HUD text line."
  - "`.evboard` is excluded from `STAT_ABOVE` so buffs never hit `stat-noroom`."
  - "`eventHudLine` prevents duplicate journal entries on HUD-line redirect; board summaries are never journaled."
traps:
  - "Do not cite the test or mutant counts from the audit; those files are not in the live tree."
  - "Board off (or hidden in HUD editor) must reset memory and route lines to original destinations."
  - "`--ui-pillar` pillarbox on classic skin is unresolved."
dfu: []
tags:
  - audit
  - events1
  - event-board
  - hud
---

# Event Board Clocks, Row Joins, and HUD Routing

The Event Board Audit (`EVENTS1`) verifies the separation between row law in `src/worldEvents/eventBoard.js`, notice queueing in `src/worldEvents/eventNotices.js`, and DOM placement in `src/ui/eventBoard.js`. Shared-event producers connect from `src/scenes/world.js`, while `tools/eventBoardProbe.mjs` probes layout geometry across skins and screens.

## Layout Isolation, Fallback Routing, and Accessibility

- **HUD placement and buff isolation (`src/ui/eventBoard.js`, `src/ui/hud.js`, `src/ui/enhancedHud.js`, `src/ui/enhancedStyle.js`):** Each layout copies `--hud-scale` from `.hud` onto the board, and `hideHudTextSurfaces` in `src/ui/hud.js` hides the plate alongside other HUD text surfaces. `.evboard` is excluded from `STAT_ABOVE` so buffs never hit `stat-noroom`. On the classic skin under a retro pillarbox, `--ui-pillar` remains unresolved because only `src/ui/enhancedHud.js` writes it.
- **Space fallback and journal deduplication (`eventBoardPlace`, `eventHudLine`):** When vertical space is short, `eventBoardPlace` drops rows or stands the plate down, sending news to the HUD text line via `eventHudLine`. Because `eventNotice` already logs lines once, `eventHudLine` prevents duplicate journal entries on redirect, and board summaries are never journaled. Turning the board off or hiding it in the HUD editor resets announcement memory and routes lines to their original destinations.
- **Screen-reader announcements:** News announces through one visually hidden, atomic, polite `aria-live` region while `.evboard` stays `aria-hidden`.
