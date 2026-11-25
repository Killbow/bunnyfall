---
slug: roads-network-overview
title: "Roads: Basic Roads Network, Painter Seam, and Map Lines"
domain: world
kind: overview
parent: null
files:
  - src/world/roadsProducer.js
  - src/world/roadNetwork.js
  - src/world/roadPainter.js
  - src/world/roadsCache.js
  - src/world/pathData.js
  - src/world/terrainGen.js
  - src/scenes/roadSweep.js
  - src/ui/overworldModel.js
  - src/ui/inkMap.js
  - src/travel/travelMapState.js
  - vendor/roads-hazelnut/README.md
routes: []
tables: []
replacesBible:
  - "03-World/Roads.md"
related:
  - roads-hazelnut-data-and-procedural-fallback
  - roads-painter-seam-and-paths-mask
  - roads-verge-clearance-and-tree-fit
  - held-map-ink-cartography-and-zoom-bands
  - held-map-travel-options-and-filter-key
  - living-world-roads-trips-and-encounters
  - bantha-jungle-trails-and-roadside-pairs
invariants:
  - "The network is four 1000x500 compass-mask byte arrays (roads, tracks, rivers, streams), one byte per map pixel: N=128, NE=64, E=32, SE=16, S=8, SW=4, W=2, NW=1."
  - "Hazelnut Basic Roads data is vendored verbatim under vendor/roads-hazelnut/ (roadData/trackData/riverData/streamData.bytes) via MOD_ROADS. The procedural buildRoadNetwork is fallback only."
  - "Travel-map toggles persist as TravelMapSaveData.filterRoads / filterTracks (true hides). Absent in an older save means shown."
traps:
  - "Do not assume a 3D overworld road renderer exists: `roadModel` in src/ui/overworldModel.js has no importers. Live map lines come from src/ui/inkMap.js."
dfu: []
tags:
  - roads
  - tracks
  - basic-roads
  - hazelnut
  - terrain
  - travel-map
---

# Roads: Basic Roads Network, Painter Seam, and Map Lines

The road system represents roads, tracks, rivers, and streams as four `1000x500` compass-mask byte arrays (`N=128`, `NE=64`, `E=32`, `SE=16`, `S=8`, `SW=4`, `W=2`, `NW=1` in `src/world/pathData.js`), driving both terrain tile painting (`src/world/roadPainter.js`) and 2D travel-map cartography (`src/ui/inkMap.js`).

## Subcards and Responsibilities

- **Basic Roads data and fallback (`roads-hazelnut-data-and-procedural-fallback`):** Loads vendored Hazelnut Basic Roads arrays (`roadData.bytes`, `trackData.bytes`, `riverData.bytes`, `streamData.bytes` under `vendor/roads-hazelnut/`) via `MOD_ROADS` (`src/world/roadsProducer.js`), with IndexedDB caching (`src/world/roadsCache.js`) and procedural `buildRoadNetwork` (`src/world/roadNetwork.js`) as an offline fallback. When road data arrives after boot, `createRoadSweep` (`src/scenes/roadSweep.js`) tears down and rebuilds built pixels where `withRoads` is `false`, nearest first.
- **Painter seam and paths mask (`roads-painter-seam-and-paths-mask`):** Slots `paintRoads` (`src/world/roadPainter.js`) into `src/world/terrainGen.js` right before marching squares, writing a `128x128` `paths` mask and running `smoothRoadHeights`.
- **Verge clearance and tree fit (`roads-verge-clearance-and-tree-fit`):** Clears roadside bands (`PATH_HALF_M`) and scales adjacent tree crowns and trunks (`src/world/roadVerge.js`, `src/world/roadBand.js`).
- **Map lines and filters (`src/ui/inkMap.js`, `src/travel/travelMapState.js`):** Cartography traces chains (`traceChains`), simplifies (`simplifyChain`, `SIMPLIFY_EPSILON = 0.9`), and runs a two-pass Chaikin corner cut, ordered by `RELIEF_LIFT` (`stream < river < track < trunk < route`). Toggles persist as `TravelMapSaveData.filterRoads` and `filterTracks` (`true` hides; absent means shown).
