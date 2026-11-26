---
slug: "world-of-daggerfall-loader-flatten-and-clearances"
title: "WoD Loader Order, Terrain Flatten, and Road/Gate/Star Clearances"
domain: "world"
kind: "subcard"
parent: "world-of-daggerfall-overview"
files:
  - "src/world/wodLocationLoader.js"
  - "src/world/wodLocationObjects.js"
  - "src/world/pixelBuild.js"
  - "src/world/roadClearance.js"
  - "src/world/roadsProducer.js"
  - "src/world/gateClearance.js"
  - "src/world/gatesWorld.js"
  - "src/world/streamingWorld.js"
  - "src/player/collider.js"
  - "src/world/wodLocationData.js"
routes: []
tables: []
replacesBible:
  - "03-World/World-Of-Daggerfall.md"
related:
  - "world-of-daggerfall-overview"
  - "roads-verge-clearance-and-tree-fit"
  - "house-nature-flats-boulder-uvs-and-wod-sea-region"
  - "starfall-sites-crater-and-client-host"
invariants:
  - "`pickLocations` uses `LocationSession.pixelIndex()` and falls back to `pickLocationsScan`; contested pixels resolve by list order."
  - "Placement is tile-local `(terrainX * 6.4 + x, avg * 1923.75 + y, terrainY * 6.4 + z)`."
  - "Flatten lerps interior samples 1..127 toward the rect mean by `1 / (distance-from-rect + 1)`; border rows 0 and 128 are never touched."
  - "Flatten never raises sea within `SEA_RAMP = 2` samples of the site rect."
  - "Instances outside 1..128 or whose prefab overruns 127 are skipped."
  - "ROADS-CLEAR: `roadClearance.js` tests site footprints against `basicRoadsPathsPoint` (`WOD_SITE_OBJECT_RADIUS_M = 8`, `WOD_PIECE_ROAD_CLEAR`)."
  - "GATE-CLEAR: `GATE_CLEAR_M = 24` (+ margin), `RITE_CLEAR_M = 20`, `WOD_FLAT_GATE_CLEAR_M = 2`; STAR-CLEAR uses `STAR_ROCK_M = 28`. Terrain flatten is not altered; `pixelBuild.js` holds sites via `wodHeld`, and `sweepGateClear` lives in `gatesWorld.js`."
  - "Online forces `world-of-daggerfall` on (`Enabled: true` in `onlineLane.js`), so every client that sees a gate places the same rock and refuses the same pieces against `GATE_CLEAR_M`."
  - "`ntfsCompare` orders region files by uppercased name, because the first valid instance naming a map pixel wins; any other file order changes which site is placed."
  - "The gate clearing is read once per build with `_gateClearNow` and every placement uses that value, because the gate's day can turn mid-build; the sweep rebuilds a pixel that published on a stale clearing."
traps:
  - "`isWodShrub` excludes model 60610 on `WOD_ROCK_SITES` ('Rocks', 'Mountains'), so rock-field shrubs keep mod height (ROCK-SUNK)."
  - "Giant `WOD_Mountain_*` rocks need the 64-unit coarse grid in `src/player/collider.js`; brute-force queries freeze."
  - "`TerrainSlots` pools evicted tiles; re-entering tiles keep marker state without re-promotion."
dfu: []
tags:
  - "world-of-daggerfall"
  - "flatten"
  - "roads-clear"
  - "gate-clear"
  - "star-clear"
---

# WoD Loader Order, Terrain Flatten, and Road/Gate/Star Clearances

Wilderness site selection, heightmap flattening, and road, gate, or starfall clearances govern how World of Daggerfall objects stand on a `128`-sample (`WOD_TERRAIN_SIZE = 128`, `WOD_TERRAIN_PIXEL_SIZE = 819.2`) map pixel.

- **Site picking, placement, and terrain flatten (`src/world/wodLocationLoader.js`, `src/world/wodLocationObjects.js`, `src/world/streamingWorld.js`, `src/player/collider.js`):** `pickLocations` queries `LocationSession.pixelIndex()` with fallback to `pickLocationsScan`, resolving contested pixels by list order and skipping instances outside `1..128` or prefabs overrunning `127`. Objects sit at tile-local `(terrainX * 6.4 + x, avg * 1923.75 + y, terrainY * 6.4 + z)`. Flattening lerps interior samples `1..127` toward the site rect mean by `1 / (distance-from-rect + 1)`, leaving border rows `0` and `128` untouched and never raising sea (`WOD_OCEAN_REGIONS = [31, 3, 29, 28, 30]`) within `SEA_RAMP = 2` samples of the rect. `isWodShrub` excludes model `60610` on `WOD_ROCK_SITES` (`'Rocks'`, `'Mountains'`) so rock-field shrubs retain mod height. Giant `WOD_Mountain_*` meshes rely on the `64`-unit coarse collider grid, and `TerrainSlots` pools evicted tiles to preserve marker state.
- **Road, gate, and star clearances (`src/world/roadClearance.js`, `src/world/gateClearance.js`, `src/world/gatesWorld.js`, `src/world/pixelBuild.js`):** `roadClearance.js` checks site footprints against `basicRoadsPathsPoint` (`WOD_SITE_OBJECT_RADIUS_M = 8`, `WOD_PIECE_ROAD_CLEAR`). Gate and starfall clearings (`GATE_CLEAR_M = 24`, `RITE_CLEAR_M = 20`, `WOD_FLAT_GATE_CLEAR_M = 2`, `STAR_ROCK_M = 28`) leave terrain flattening intact while `pixelBuild.js` holds objects via `wodHeld` and `sweepGateClear` rebuilds cleared tiles.
