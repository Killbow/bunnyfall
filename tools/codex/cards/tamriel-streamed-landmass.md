---
slug: tamriel-streamed-landmass
title: "Streamed Land Beyond the Bay"
domain: world
kind: subcard
parent: tamriel-continent-frame-overview
files:
  - src/world/tamrielGround.js
  - src/world/tamrielRaster.js
  - src/world/streamingWorld.js
  - src/world/terrainGenWorker.js
  - src/world/segment.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "03-World/Tamriel.md"
related:
  - tamriel-continent-frame-overview
  - tamriel-runtime-trace-and-fit
  - pixel-streaming-and-origin-shift
invariants:
  - "The Bay is not moved by a byte. groundWoods(woods) is an Object.create child of the Bay WoodsFile. Within SEAM_PX = 2 of the edge it returns the Bay's own clamped read; beyond that it blends from the edge byte into tamrielHeightByte over BLEND_PX = 12."
  - "The land beyond the Bay carries height, climate textures and trees only: no towns, roads, dungeons or regions."
  - "groundClimateIndex keeps the Bay's own climate inside inBay and uses tamrielClimateAt outside it (the province climate, or CLIMATES.Ocean at sea)."
  - "The terrain worker's import graph stays pure (no ui/, no net/). Shared segmentDistance lives in src/world/segment.js, which imports nothing."
traps:
  - "Importing segmentDistance from a net/ gate module pulled net/wire.js and about 20 modules into the worker bundle, and the world froze on going outside (TAMRIEL2-WORKER)."
  - "Region lookups past the Bay fall to MapsFile's clamp (region 0, Alik'r Desert). The arc does not author regions there."
dfu:
  - Assets/Scripts/API/WoodsFile.cs
  - Assets/Scripts/Terrain/StreamingWorld.cs
tags:
  - tamriel
  - terrain
  - streaming
  - worker
  - seam
---

# Streamed Land Beyond the Bay

When `tamriel-land` is active, the terrain streamer and worker extend ground height, climate textures, and climate trees across the continent frame while keeping every Iliac Bay tile byte-identical.

- **Seam-Protected Woods and Climate Composition (`src/world/tamrielGround.js`):** `groundWoods(woods)` wraps the loaded `WoodsFile` via `Object.create(woods)`. Within Chebyshev distance `SEAM_PX = 2` (`bayEdgeDistance`), `getHeightMapValue` and `getLargeMapData` return the Bay's own clamped edge reads so kernel sampling windows on Bay border tiles never change. Past the seam, heights blend linearly over `BLEND_PX = 12` into `tamrielHeightByte(x, y)`, and detail uses `tamrielLargeMap` (seeded by `groundHash`). `groundClimateIndex` preserves Bay climate inside `inBay` and falls back to `tamrielClimateAt` (province climate or `CLIMATES.Ocean`).
- **Height Law, Cache, and Rasterizer (`src/world/tamrielGround.js`, `src/world/tamrielRaster.js`):** `authoredHeightByte` returns `0` at sea and rises from `SHORE_BYTE = 5` to `INLAND_BYTE = 22` over `PLAIN_REACH = 6` picture units, lifted toward `SNOW_BYTE = 112` by mountain range `rangeLift` plus lattice noise. `tamrielHeightByte` caches up to `GROUND_CACHE_MAX = 262144` pixels (`groundCacheSize`) before clearing whole via `dropGroundCache`. `src/world/tamrielRaster.js` re-exports the height constants, defines `PROVINCE_NONE = 255`, and provides `rasterizeTamriel({ cell = 8 })` and `composeBay(raster, bay)`.
- **Streaming Frame and Worker Purity (`src/world/streamingWorld.js`, `src/world/terrainGenWorker.js`, `src/world/segment.js`, `src/scenes/world.js`):** The world host sets `StreamingWorldState.frame` to `tamrielFrameInBay()` so `StreamingWorldState.streams(px, py)` queues continent pixels, and forwards `{ trace, fit }` to `src/world/terrainGenWorker.js` (`setTamrielTrace`, `setTamrielFit`, `dropGroundCache`). Shared `segmentDistance` lives in zero-import `src/world/segment.js` so the worker graph never pulls `net/` or `ui/`.
