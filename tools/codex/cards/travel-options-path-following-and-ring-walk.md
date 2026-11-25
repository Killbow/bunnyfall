---
slug: travel-options-path-following-and-ring-walk
title: "Travel Options Path Following, Junctions, and Town Ring Walk"
domain: world
kind: subcard
parent: travel-options-journey-overview
files:
  - src/travel/travelOptions.js
  - src/travel/travelPaths.js
  - src/ui/travelJunctionMap.js
  - src/ui/travelPathsOverlay.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Travel-Options.md"
related:
  - travel-options-journey-overview
  - travel-options-pace-dials-and-rate-ceilings
  - roads-hazelnut-data-and-procedural-fallback
  - roads-network-overview
invariants:
  - "`selectNextPath` continues straight only when `countSetBits(pathsDataPt) === 2` and the `nextPathDirection` pick has exactly one bit set. Anything else is a junction: `MsgArrivedJunc` is shown and the junction map is drawn if `roadsJunctionMap` is on."
  - "Compass bits share one 8-direction encoding across the Hazelnut and generated networks, pinned by `sameCompass()` in `src/travel/travelPaths.js`."
  - "`circumnavigateLocation` walks the border ring corner by corner (`circumnavigateTarget` over `locBorderCornerRects`). It sets `st.walk = 'ring'` and `st.route = null`, and its rate is capped at `MAX_CIRCUMNAVIGATION_ACCEL = 15`."
  - "The location pause modes are `LOC_PAUSE_OFF` (`0`), `LOC_PAUSE_NEAR` (`1`), and `LOC_PAUSE_ENTER` (`2`). After `interruptTravel` under `ENTER`, `st.enterRectDetached` stays set, which keeps the mod one-shot unsubscribe."
traps:
  - "`ROAD-CRASH`: a ring walk whose `locationRect` or `locationBorderRect` is gone closes the window or interrupts instead of dereferencing `null`. Otherwise the frame loop dies."
  - "Departure 17: `nextPathDirection` raw leftover can name the current pixel. Treating it as a leg loops on arrival forever, so a pick that is not one bit is a junction."
  - "`SPAWN-TRAVEL`: the near-pause discovers places by `mapId` (`discoverLocation(loc.mapId, ...)`) so cloned or spawned dungeons resolve."
dfu: []
tags:
  - travel-options
  - roads
  - junction-map
  - ring-walk
  - path-following
---

Road and track following (`followPath` in `src/travel/travelOptions.js` and `src/travel/travelPaths.js`) steps pixel by pixel along the 8-direction compass network, halts at junctions or location borders, and circumnavigates towns.

## Compass Encoding and Junctions

Both the Hazelnut network and generated roads share one 8-direction bitmask encoding, verified by `sameCompass()` (`src/travel/travelPaths.js`) and drawn by `src/ui/travelPathsOverlay.js`. `playerOnPath` and `playerOnPathAt` check outgoing edges via `MID_LO` (`16128`) and `MID_HI` (`16640`), mapping yaw to sectors with `ANG_UNIT` (`22.5`). `targetPixel(direction, x, y)` returns the neighbor pixel for a single-bit direction.

At a pixel center, `selectNextPath` continues straight only when `countSetBits(pathsDataPt) === 2` and `nextPathDirection` leaves one set bit. Zero or multiple bits (preventing the Departure 17 self-pixel arrival loop) trigger a junction: `MsgArrivedJunc` shows and `src/ui/travelJunctionMap.js` opens when `roadsJunctionMap` is on.

## Location Pause Modes and Ring Walk

Location pauses use `LOC_PAUSE_OFF` (`0`), `LOC_PAUSE_NEAR` (`1`), and `LOC_PAUSE_ENTER` (`2`). Under `LOC_PAUSE_NEAR`, approaching a site calls `discoverLocation(loc.mapId, ...)` (`src/scenes/world.js`, `SPAWN-TRAVEL`) so spawned or cloned dungeons resolve. Under `LOC_PAUSE_ENTER`, once `interruptTravel` fires, `st.enterRectDetached` stays set for one-shot unsubscribe parity.

`circumnavigateLocation` sets `st.walk = 'ring'` and `st.route = null`, stepping via `circumnavigateTarget` over `locBorderCornerRects` up to `MAX_CIRCUMNAVIGATION_ACCEL` (`15`). Crossing a path other than `st.lastCrossed` closes the window (`onClose` interrupts). If `locationRect` or `locationBorderRect` is missing (`ROAD-CRASH`), it closes or calls `interruptTravel` instead of dereferencing `null`.
