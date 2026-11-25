---
slug: super-dungeon-look-hour-sky-islands-and-steps
title: "Abyss Dungeon Look: Hour Sky, Islands, Orrery, and Steps Ghosts"
domain: multiplayer
kind: subcard
parent: super-dungeon-look-overview
files:
  - src/render/sdSky.js
  - src/world/sdSkyArt.js
  - src/world/sdRealm.js
  - src/world/sdIslandModel.js
  - src/world/sdWorksModel.js
  - src/world/sdOrreryModel.js
  - src/world/sdHall.js
  - src/worldEvents/sdHall.js
  - src/world/sdSteps.js
  - src/world/sdStepsModel.js
  - src/render/sdStepsPass.js
  - src/worldEvents/sdSteps.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons-Look.md"
related:
  - super-dungeon-look-overview
  - shattered-hour-orrery-and-steps
  - sky-weather-and-lighting
invariants:
  - "`SdSkyMap.paint` (`src/render/sdSky.js`) renders the sky into a single `SD_SKY_MAP` (`512`) octahedral texture one quadrant per frame, refreshing the full map every four frames."
  - "The Orrery runs in mode A (`SD_ORRERY_MODE_B = false`), so orbit rings do not rotate to track the hour of each stone."
  - "Orrery stone visual geometry extends at most `SD_LAW_MARGIN` (`0.05` meters in `src/world/sdHall.js`) beyond its collision solids."
  - "Unmoored Steps ghost telegraphs render as screen-width quads sized by `telegraphLineW` rather than `GL_LINES` (which WebGL caps at `1` pixel), updating a static vertex buffer purely through uniforms with zero per-frame allocations."
traps:
  - "Comments in `src/world/sdSkyArt.js` refer to `render/sdSkyMap.js`, which does not exist; `SdSkyMap` is defined inside `src/render/sdSky.js`."
dfu: []
tags:
  - super-dungeons
  - shattered-hour
  - sky
  - orrery
  - steps
  - telegraph
---

The Shattered Hour realm combines a quadrant-updated octahedral sky, floating island clockwork, the Orrery of Endings, and the Unmoored Steps (`src/render/sdSky.js`, `src/world/sdRealm.js`, `src/world/sdHall.js`, and `src/world/sdSteps.js`).

## Octahedral Sky and Realm Lighting

`SdSkyMap` (`src/render/sdSky.js` and `src/world/sdSkyArt.js`) paints one quadrant of the `SD_SKY_MAP` (`512`) octahedral texture each frame over a `SD_SKY_PERIOD` (`720` s) cycle, positioning the clock face (`SD_CLOCK_FACE` `{ az: 0, elev: 0.2, r: 0.34, hourTurns: 1, minuteTurns: 12 }`) and shards via `CLOCK_BASIS`, `SD_CLOCK_TOP`, and `SD_SHARD_TOP`. Its shader helpers `SD_SKYLINE_GLSL` and `SD_SKY_FETCH_GLSL` are shared with `src/render/sdRiftPass.js`.

`src/world/sdRealm.js` configures `SD_REALM_TRILIGHT`, `SD_REALM_KEY_LIGHT`, `SD_LAMP_COLOR` (`[1.0, 0.78, 0.4]`), exponential haze `SD_REALM_FOG` (`density = 0.0045`), and `SD_FLOOR_TILE_M` (`2` meters). `islandRoot` (`src/world/sdIslandModel.js`) builds island undersides, while `src/world/sdWorksModel.js` builds background clockwork.

## Orrery Geometry and Unmoored Steps Telegraphs

`src/world/sdOrreryModel.js` and `src/worldEvents/sdHall.js` assemble the Orrery via `buildOrbitRing` and `buildOrreryHub` (`SD_ORRERY_MODE_B = false`). Stones measure `SD_STONE_SIZE` (`{ w: 1.6, d: 0.7, h: 2.6 }`) within `SD_LAW_MARGIN` (`0.05` m) of their collision boxes and animate at `SD_HAND_RATE` (`3`), `SD_SNAP_RATE` (`9`), `SD_BRIDGE_LAY_MS` (`900` ms), and `SD_STONE_SETTLE_MS` (`700` ms).

On the Unmoored Steps (`src/world/sdStepsModel.js`, `src/render/sdStepsPass.js`, and `src/worldEvents/sdSteps.js`), `buildPendulum` and `buildCrumbleChunks` (`n = 4`, `SD_CRUMBLE_BACK = 5` s) pair with `SD_GUST_WARN` (`1` s), `SD_BEAT_BLINK_HZ` (`2.5` Hz), `SD_BEAT_CYCLE` (matching `EG_BEAT_CYCLE_S`), and zero-allocation screen-aligned ghost quads (`telegraphLineW`).
