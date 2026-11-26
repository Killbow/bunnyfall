---
slug: pixel-streaming-and-origin-shift
title: Pixel Streaming and Floating Origin
domain: world
kind: overview
files:
  - src/scenes/world.js
  - src/world/streamingWorld.js
  - src/world/pixelBuild.js
  - src/world/terrainGen.js
  - src/world/terrainGenClient.js
  - src/formats/woodsFile.js
  - src/characters/corpseMarker.js
  - src/characters/enemyMotor.js
dfu:
  - Assets/Scripts/Terrain/StreamingWorld.cs
  - Assets/Scripts/Utility/FloatingOrigin.cs
  - Assets/Scripts/API/WoodsFile.cs
related:
  - four-hosts-and-modal-frame
  - world-modes-and-transitions
invariants:
  - Exterior streaming loads a Chebyshev `(2d + 1)^2` grid (`TERRAIN_DISTANCE = 3` default, `819.2` scene units per pixel at `GLOBAL_SCALE = 0.025`) nearest-first via `StreamingWorldState`.
  - Floating-origin recenters shift every world-space holder in the same frame by `(-dx * 819.2, 0, +dy * 819.2)` on pixel crossings and vertically past `+/-500` after `adjustFallStart`.
  - "A corpse marker keeps its creation parameters because a floating-origin recenter rebuilds its billboard batch, whose centers are baked into a static buffer."
  - "`offsetOrigin` shifts every world position the motor holds, such as `feet`, destinations, last-known and predicted target positions, the flee point, the fall anchor, and a charge head. Aliased arrays move once."
traps:
  - "`WOODS.WLD` heightmaps run `py` southward (`z = (499 - py) * 32768`); `getLargeHeightMapValuesRange` must strip each 5x5 cell to its interior 3x3, invert sample Y (`srcData[ix][4 - iy]`), and step descending map Y (`mapPixelY - y`)."
  - Missing any world-space system (camera, interpolation endpoints, colliders, billboards, grass, arrows, or ships) during origin recenter strands it `819.2` units away.
tags:
  - streaming
  - floating-origin
  - terrain
  - woods
---

# Pixel Streaming and Floating Origin

Exterior overworld streaming keeps scene coordinates near `[0, 0, 0]` for WebGL float precision while loading a Chebyshev `(2d + 1)^2` grid of map pixels (`TERRAIN_DISTANCE = 3` default, `819.2` scene units per pixel at `GLOBAL_SCALE = 0.025`).

- **Streaming pipeline:** `StreamingWorldState` (`src/world/streamingWorld.js`) queues pixels nearest-first (`nearestFirstFrom`), `src/world/pixelBuild.js` (`createPixelBuild`) builds terrain and town blocks, and `TerrainGenClient` (`src/world/terrainGenClient.js`) promotes near-ring terrain to stride `1` off-thread via `src/world/terrainGen.js` (`generatePixelTerrain`, `restrideGrid`).
- **`WOODS.WLD` axis traps (`src/formats/woodsFile.js`):** The 1000x500 world map runs `py` southward (`z = (499 - py) * 32768`). `getLargeHeightMapValuesRange` trims each 5x5 cell to its interior 3x3, inverts sample Y (`srcData[ix][4 - iy]`), and steps source pixels with descending map Y (`mapPixelY - y`).
- **Floating-origin recenter (`src/scenes/world.js`):** Crossing a pixel shifts the world by `(-dx * 819.2, 0, +dy * 819.2)`, and vertical shifts fire past `+/-500` after `adjustFallStart` updates fall height so hops never register 500-unit fall damage.
- **Lockstep rebasing:** Every world-space holder shifts in that same frame, including camera, player interpolation endpoints, pixel and peer billboard origins, colliders, shadow cache, sky and cloud shadows, grass, projectiles, and ships.
