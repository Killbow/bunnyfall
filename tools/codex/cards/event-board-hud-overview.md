---
slug: event-board-hud-overview
title: "World Events Board: Shared-Event HUD Plate Instead of Chat"
domain: ui
kind: overview
parent: null
files:
  - src/worldEvents/eventBoard.js
  - src/worldEvents/eventNotices.js
  - src/ui/eventBoard.js
  - src/ui/eventBoardKey.js
  - src/mods/features.js
  - src/scenes/world.js
  - src/ui/hud.js
  - src/worldEvents/eventTimers.js
  - src/systems/starfall/starfallClient.js
  - src/net/starfall/starfallLaw.js
  - src/worldEvents/raidingParties.js
  - src/ui/eventMapMarks.js
routes: []
tables: []
replacesBible:
  - "10-UI/Event-Board.md"
related:
  - event-board-plate-layout-and-filters
  - event-board-notice-door-and-news-toasts
  - world-events-and-signed-receipts
  - starfall-overview
  - raiding-parties-overview
invariants:
  - "`eventBoardModel` reads the same source as the Timers window (`eventTimerRows`). It keeps only shared events that are live or start within `EVENT_SOON_MS` (15 min). Live rows come first, by least time left; coming rows follow, by soonest start."
  - "Only `scenes/world.js` seats `timersSource` through `seatEventBoard`. `exterior.js`, `worldModes.js` and `dungeonContext.js` seat none."
  - "`drawEventBoard` runs from `drawHud` in `src/ui/hud.js`, the one call all hosts make. `hideHudTextSurfaces` hides it through the same door."
  - "The starfall client names each star's town and map pixel from `STAR_WARN_MS` (10 min) before it lands. The old `STAR_OMEN_MS` (90 s) omen is no longer the first warning."
traps:
  - "Resets, the seat week, battles, and Elite Breach stay in the Timers window only. `EVENT_BOARD_KINDS` derives from `EVENT_KINDS[k].row`, and the festival is news only."
  - "When the relay drops, the board keeps its last source read and its local clock offset; it does not blank."
  - "The EVENT-BOARD-KEY action `EventBoard` (`src/ui/eventBoardKey.js`) flips the same `eventBoard` pref. It is installed before the on-check so it can bring the board back."
dfu: []
tags:
  - ui
  - hud
  - world-events
  - event-board
  - events1
  - events2
---

# World Events Board: Shared-Event HUD Plate Instead of Chat

`src/worldEvents/eventBoard.js` and `src/ui/eventBoard.js` replace chat broadcasts (`pushAll`) for shared world events with a compact HUD plate and a dedicated notice door (`src/worldEvents/eventNotices.js`). Daggerfall Unity has no shared events, so this subsystem is Bunnyfall-only.

- **Shared-Event Source and Ordering:** `eventBoardModel` reads `eventTimerRows` (`src/worldEvents/eventTimers.js`) via the `timersSource` callback seated exclusively by `src/scenes/world.js` (`seatEventBoard`). It filters for shared events (`EVENT_KINDS` in `src/mods/features.js`: `gate`, `serpent`, `super`, `star`, `raid`, and news-only `festival`) that are active or start within `EVENT_SOON_MS` (`15` min, also passed to `raidTimerList` as look-ahead in `src/worldEvents/raidingParties.js`). Live rows sort first by shortest remaining duration, followed by upcoming rows sorted by earliest start.
- **Host Wiring and Toggle Key:** `drawEventBoard` runs from `drawHud` in `src/ui/hud.js` and hides alongside `hideHudTextSurfaces`. The rebindable `EventBoard` action (`src/ui/eventBoardKey.js`, `Equal` by default) is checked before the enabled guard so players can toggle the `eventBoard` preference back on. Removing the `events` piece in the Enhanced Plus HUD editor also disables the plate.
- **Distance Readouts and Starfall Lead Time:** Rows display distance and compass bearing rather than travel time (`src/ui/eventMapMarks.js`). `src/systems/starfall/starfallClient.js` and `src/net/starfall/starfallLaw.js` reveal each star's target town and map pixel at `STAR_WARN_MS` (`10` min) before impact instead of waiting for `STAR_OMEN_MS` (`90` s). Recurrence rates remain three stars per festival hour, about 22 raids per two-hour day, and one gate per game day.
