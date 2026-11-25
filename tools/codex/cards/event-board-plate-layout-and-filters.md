---
slug: event-board-plate-layout-and-filters
title: "Event Board Plate: Measured Placement, Row Caps, and Per-Kind Chips"
domain: ui
kind: subcard
parent: event-board-hud-overview
files:
  - src/ui/eventBoard.js
  - src/worldEvents/eventBoard.js
  - src/mods/features.js
  - src/ui/enhancedHud.js
  - src/net/gateLaw.js
routes: []
tables: []
replacesBible:
  - "10-UI/Event-Board.md"
related:
  - event-board-hud-overview
  - event-board-notice-door-and-news-toasts
invariants:
  - "`eventBoardPlace` puts the plate's top at max(`clamp(244px, 40vh, 460px)`, the lowest `EVENT_ABOVE` box + `EVENT_GAP_PX`). Its floor is the highest `EVENT_BELOW` box (status, quick slots, hotbar, vitals, temperature, touch buttons, travel bar, party list). On the classic skin the floor is `EVENT_CLASSIC_FOOT` (0.22) of the screen height."
  - "Row cap: `eventRowsFor` gives `EVENT_TALL_ROWS` (4) at heights of `EVENT_TALL_PX` (900) or more, otherwise `EVENT_BOARD_ROWS` (3). `drawFitted` then drops one row at a time until the plate fits."
  - "At most `EVENT_BOARD_RAIDS` (2) raids, the nearest, are shown. Overflow reads 'N more in Timers'."
  - "The plate copies `--hud-scale` from `.hud`."
  - "Hidden kinds (`eventKindShown`, pref `eventBoard-<kind>` via `eventKindPref`) are dropped before the cut, so they never count toward 'more'."
traps:
  - "If even the news cannot fit, each card goes to `eventHudLine` and the plate stands down until room returns."
  - "A plate moved in the HUD editor (`data-hm-moved`) skips measurement (room = Infinity)."
  - "Only `enhancedHud.js` writes `--ui-pillar`, so under a classic-skin retro pillarbox the plate sits over the black bars."
  - "Distance is drawn before the place name, so truncation never cuts direction or km. 'Nearby' means the same map pixel (`PIXEL_M` 819.2)."
dfu: []
tags:
  - ui
  - hud
  - layout
  - event-board
  - prefs
  - events2
---

# Event Board Plate: Measured Placement, Row Caps, and Per-Kind Chips

`src/ui/eventBoard.js` and `src/worldEvents/eventBoard.js` measure available vertical HUD room, cap visible rows, and filter shared-event kinds through per-kind preference chips.

- **Measured Vertical Placement:** `eventBoardPlace` reads the source at most every `EVENT_READ_MS` (`500` ms) and measures layout every `EVENT_LAYOUT_MS` (`250` ms) or on content change. It places the plate top at `max(clamp(244px, 40vh, 460px), lowest EVENT_ABOVE box + EVENT_GAP_PX)` and stops above the highest `EVENT_BELOW` box (status, quick slots, hotbar, vitals, temperature, touch controls, travel bar, or party list), or above `EVENT_CLASSIC_FOOT` (`0.22` of screen height) on the classic skin. The plate inherits `--hud-scale` from `.hud` and skips measurement when dragged in the HUD editor (`data-hm-moved`). Under retro pillarbox, only `src/ui/enhancedHud.js` sets `--ui-pillar`.
- **Row Caps and Raid Culling:** `eventRowsFor` allows `EVENT_TALL_ROWS` (`4`) when viewport height reaches `EVENT_TALL_PX` (`900`), and `EVENT_BOARD_ROWS` (`3`) otherwise. `drawFitted` sheds one row at a time until the plate fits; if even a news toast cannot fit, cards fall back to `eventHudLine`. At most `EVENT_BOARD_RAIDS` (`2`) nearest raids appear, with excess rows summarized as `N more in Timers`.
- **Per-Kind Chips and Distance Formatting:** Per-kind visibility (`eventKindShown`, stored under `eventBoard-<kind>` via `eventKindPref` in `src/mods/features.js`) filters rows before truncation and uses `EVENT_KIND_CSS` colors matching the Timers window. Toggling a chip resets `readAt` and calls `toasts.drop(kind)`. Each row prints compass bearing and kilometers before the place name, or `Nearby` within the same map pixel (`PIXEL_M = 819.2` in `src/net/gateLaw.js`).
