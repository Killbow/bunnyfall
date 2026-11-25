---
slug: df-look-ship-and-caravan-windows
title: "Ship Night Windows and Caravan Glass"
domain: render
kind: subcard
parent: df-look-overview
files:
  - src/world/galleonArt.js
  - src/world/carrackArt.js
  - src/world/wagonArt.js
  - src/systems/naval/comeSailAwayPool.js
  - src/systems/naval/shipLiveryPaint.js
  - src/travel/caravanRoomHost.js
routes: []
tables: []
replacesBible:
  - "01-Overview/DF-Art.md"
related:
  - df-look-overview
  - ship-livery-flags-and-plaques
  - wagons-caravan-room-paint-and-visits
invariants:
  - "Night twin records sit `NIGHT_RECORD_OFFSET` (`100`) past their day record: `GALLEON_NIGHT` over stern-window records, `CARRACK_NIGHT` over transom records."
  - "By day stern slices have glass cut out by `cutGlass` along the glow mask; at night the whole twin renders with glow as emission via `NIGHT_REMAP` while city lights are on."
traps:
  - "Repainting a stern/transom slice requires repainting its night twin (e.g. `38131_106`, `38131_121`, `38141_106`, `38141_121`)."
  - "Caravan windows are cut inside and out (`isGlassRecord` in `wagonArt.js`); port windows stay whole and sit 2 cm proud of the wall."
dfu: []
tags:
  - windows
  - night
  - ships
  - caravan
---

# Ship Night Windows and Caravan Glass

Ships, caravans, and port buildings handle window panes differently depending on whether the player can look through into an interior or view lit cabin glass at night across `src/world/galleonArt.js`, `src/world/carrackArt.js`, `src/world/wagonArt.js`, `src/systems/naval/comeSailAwayPool.js`, `src/systems/naval/shipLiveryPaint.js`, and `src/travel/caravanRoomHost.js`.

- **Ship daytime cutouts and night twins (`NIGHT_RECORD_OFFSET`):** On the galleon and carrack, daytime stern-window and transom slices have glass panes cut out by `cutGlass` along the glow mask so cabin interiors show by day. Each windowed slice also builds a night twin at `NIGHT_RECORD_OFFSET = 100` past the day record (`GALLEON_NIGHT` exported with `NIGHT_RECORD_OFFSET` from `src/world/galleonArt.js`, and `CARRACK_NIGHT` in `src/world/carrackArt.js`). While `cityLightsOn` holds in `src/systems/naval/comeSailAwayPool.js`, `NIGHT_REMAP` swaps to the night twin (`38131_106`, `38131_121`, `38141_106`, and `38141_121`), rendering the whole twin with the glow mask as emission. Whenever `src/systems/naval/shipLiveryPaint.js` repaints a stern or transom slice, it must also repaint the `+ 100` night twin.
- **Caravan and port glass (`isGlassRecord`):** In `src/world/wagonArt.js` and `src/travel/caravanRoomHost.js`, `isGlassRecord` matches `caravanSide`, `caravanFront`, `roomSide`, and `roomFront` modulo `LOOK_RECORD_STRIDE` (`100`) to cut glass inside and out. Port windows stay whole and sit `2` cm proud of the wall.
