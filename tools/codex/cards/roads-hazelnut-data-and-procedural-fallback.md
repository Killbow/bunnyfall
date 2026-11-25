---
slug: roads-hazelnut-data-and-procedural-fallback
title: "Basic Roads Loading, Retry, Network Cache, and Procedural Fallback Dials"
domain: world
kind: subcard
parent: roads-network-overview
files:
  - src/world/roadsProducer.js
  - src/world/roadNetwork.js
  - src/world/roadsCache.js
  - src/scenes/roadSweep.js
  - src/scenes/bootReads.js
routes: []
tables: []
replacesBible:
  - "03-World/Roads.md"
related:
  - roads-network-overview
  - roads-painter-seam-and-paths-mask
invariants:
  - "loadModRoads races each file against MOD_ROADS_FETCH_TIMEOUT_MS (30000 ms) and rejects any file whose length is not MAP_WIDTH*MAP_HEIGHT. Any failure returns null, never throws."
  - "retryModRoads tries up to MOD_ROADS_RETRY_MAX (12) more times, waiting min(60000, 5000 * 2^tries) ms before each."
  - "waterOffPaths clears every river/stream bit shared with a road or track bit on load, so a shared arm belongs to the path alone (no sunken-canal dirt roads)."
  - "ROAD_TYPES = TownCity, TownHamlet. TRACK_TYPES = TownVillage, Tavern, ReligionTemple, HomeWealthy, ReligionCult, Coven. Dungeons and graveyards get nothing."
  - "buildRoadNetwork is pure: locations + heightAt + isWater + dials in, { roads, tracks, stats } out. Water is impassable, and settlement pixels are never intermediate steps."
  - "cachedNetwork stores built networks in IndexedDB `daggerfall-roads`/`networks`, keyed by GENERATOR_VERSION (20), the dials, the settlement fingerprint and woodsLength. A store that cannot open is a miss, never an error."
traps:
  - "Tuning a ROAD_DIALS value needs no GENERATOR_VERSION bump (the dials are in the key), but changing boot height smoothing does (AUDIT 58 F4)."
  - "Never hardcode the network as procedural online: the lane forces Basic Roads, and the host retries rather than fall back."
dfu: []
tags:
  - roads
  - a-star
  - dials
  - indexeddb
  - retry
  - fallback
---

# Basic Roads Loading, Retry, Network Cache, and Procedural Fallback Dials

The road producer loads Basic Roads byte arrays with exponential retry and water-arm deduplication, falling back offline to a cached A* procedural generator (`src/world/roadsProducer.js`, `src/world/roadNetwork.js`, `src/world/roadsCache.js`).

## Basic Roads Fetch, Retry, and Water Cleanup

- **Fetch and retry (`src/world/roadsProducer.js`, `src/scenes/bootReads.js`):** `loadModRoads` races each file against `MOD_ROADS_FETCH_TIMEOUT_MS` (`30000` ms) and requires byte length `MAP_WIDTH * MAP_HEIGHT`, returning `null` on any failure. `retryModRoads` retries up to `MOD_ROADS_RETRY_MAX` (`12`) times with `min(60000, 5000 * 2^tries)` ms backoff. Online play forces Basic Roads and retries rather than falling back.
- **Shared arm cleanup (`src/world/roadsProducer.js`):** On load, `waterOffPaths` clears any river or stream bit that overlaps a road or track bit so shared arms stay dry paths.

## Procedural Fallback and IndexedDB Cache

- **Pure A* builder (`src/world/roadNetwork.js`):** `buildRoadNetwork` takes locations, `heightAt`, `isWater` (`WATER_BYTE = SCALED_BEACH_ELEVATION / BASE_HEIGHT_SCALE`), and `ROAD_DIALS` (`neighbours: 2`, `roadReach: 70`, `trackLink: 24`, `trackNeighbours: 2`, `trackReach: 20`, `climbCost: 80`, `descentCost: 10`, `highCost: 0.08`, `highAbove: 40`, `roadDiscount: 0.5`, `mergeNear: 3`, `joinAngle: 3`, `turnCost: 0.4`), returning `{ roads, tracks, stats }` (including `stats.unroutedPairs`). `ROAD_TYPES` connects `TownCity` and `TownHamlet`; `TRACK_TYPES` connects `TownVillage`, `Tavern`, `ReligionTemple`, `HomeWealthy`, `ReligionCult`, and `Coven`, while dungeons and graveyards receive neither.
- **IndexedDB cache (`src/world/roadsCache.js`):** `cachedNetwork` persists built networks in `daggerfall-roads` / `networks`, keyed by `GENERATOR_VERSION` (`20`), dials, settlement fingerprint, and `woodsLength`.
