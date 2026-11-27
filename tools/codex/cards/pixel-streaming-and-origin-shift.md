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
  - src/render/labGrass.js
  - src/world/terrainLodWorld.js
  - src/world/terrainHeightWorld.js
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
  - "The grass field (`src/render/labGrass.js`) keeps its own cell-grid origin, which `shiftOrigin` moves with each origin shift, so cell keys and seeds never change, and a half-placed cell starts again in the new frame."
  - "`init` zeroes the x and z compensation but keeps the vertical component, as DFU's `ResetStreamingWorld` does. Zeroing all three moves the player vertically on a re-init or teleport."
  - "`onMap` must gate placement: the world map reader clamps, so an off-map pixel would otherwise stream invented Temperate terrain with its own ground archive and scatter, where DFU leaves the edge of the world empty."
  - "A pixel build is shared through the `inFlight` promise map, so pump, boot, and teleport callers await the same build; a second build of one pixel leaks its GPU resources and doubles colliders and doors."
  - "`heightAt` finds the containing pixel by inverting the affine pixel translation from `compensation`, which is correct only while the current pixel's frame sits at the origin under compensation."
  - "The ring stride is re-checked at publish, because the player may cross a pixel during the worker round trip and the restride sweep cannot see an unpublished pixel; promotions queue and demotions settle at once."
traps:
  - "`WOODS.WLD` heightmaps run `py` southward (`z = (499 - py) * 32768`); `getLargeHeightMapValuesRange` must strip each 5x5 cell to its interior 3x3, invert sample Y (`srcData[ix][4 - iy]`), and step descending map Y (`mapPixelY - y`)."
  - Missing any world-space system (camera, interpolation endpoints, colliders, billboards, grass, arrows, or ships) during origin recenter strands it `819.2` units away.
  - "`standFlatGroups` measures the pixel's solid props before placing any tree, because groups are met in flat order and a fountain listed after a tree beside it would otherwise be missed by the trunk fit."
  - "Nothing may be awaited between the deep-water result and `built.set`; the World of Daggerfall carry is adopted at that point so a sweep during the build cannot leave a stale roll in the new world."
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
