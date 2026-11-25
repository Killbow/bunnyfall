---
slug: "deep-waters-overview"
title: "Deep Waters: Carved Sea, Floor, Cap, and Far Clip"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/world/deepWatersBake.js"
  - "src/world/deepWatersBakeCache.js"
  - "src/world/deepWatersClient.js"
  - "src/world/deepWatersWorker.js"
  - "src/world/deepWatersPixel.js"
  - "src/world/deepBathymetry.js"
  - "src/world/deepWaterClassification.js"
  - "src/world/deepWaterFloor.js"
  - "src/world/deepWaterCap.js"
  - "src/world/deepWaterSurface.js"
  - "src/underwater/deepWatersHost.js"
  - "src/underwater/deepWatersWorld.js"
  - "src/render/deepWatersRender.js"
  - "src/render/renderer.js"
  - "src/world/terrainSurface.js"
  - "src/platform/onlineLane.js"
  - "src/mods/modSettings.js"
routes: []
tables: []
replacesBible:
  - "03-World/Deep-Waters.md"
related:
  - "deep-waters-swim-driver-and-forge"
  - "deep-waters-fish-and-seafloor-decorations"
  - "deep-waters-enemies-and-sunken-loot"
  - "eltheric-ocean-deep-water-bake-planes"
invariants:
  - "The coastline distance bake is rebuilt on the client from WOODS.WLD, MAPS.BSA and BLOCKS.BSA in deepWatersWorker.js. It uses octile (1, sqrt 2) distance capped at BAKE_DISTANCE_CAP (255 x 16 m) and is cached in IndexedDB (deepWatersBakeCache.js, db 'daggerfall-deepwaters')."
  - "Bake planes are bounded by PLANE_KEEP_MAX and PLANE_KEEP_RADIUS. Read the live values from deepWatersBake.js."
  - "In a carved cell, world `heightAt` answers the seafloor directly, while hole-edge walls sit in a separate collider bucket (`host.wallBuckets`)."
  - "The port carves every streamed pixel, deferred builds nearest first. The mod carves only within one pixel of the player. The deferred queue outlives a transient reset."
  - "`FAR-CLIP1`: `terrainClipFs` (`renderer.js`) appends a discard on `CLIP_SENTINEL` (255, `terrainSurface.js`) after the tile decode derivative, built lazily by `_ensureTerrainClip` / `prepareTerrainClip` for cap-patched pixels (`clippedTerrainIndices` in `deepWaterCap.js`)."
  - "Online rooms pin 13 iliac-puddle-no-more keys in onlineLane.js: Enabled, WaterDepth, enemy spawn/frequency/MaxLiveEnemies, loot rate/caps/cove, SwimSpeedMultiplier, EnableSwimStroke, ArgonianInfiniteBreath. Looks (fog, fish, weed, surfaces) stay per-player."
traps:
  - "DFU TerrainNature reads tilemapSamples[x, y], but the mod reads [z, x]. The port keeps the transpose (deepWaterClassification.js), so a water quad can sit at sea level under raised ground."
  - "The clip discard must stay after the dFdy line (CLIP_AFTER). A derivative next to a discarded fragment is undefined in GLSL ES 3.00."
  - "Header comments cite stale scenes/deepWater/ and systems/deepWater/ paths. The live modules are in src/underwater/ and src/world/."
dfu: []
tags:
  - "deep-waters"
  - "iliac-puddle-no-more"
  - "seafloor"
  - "bake"
  - "terrain-clip"
  - "online"
---

# Deep Waters: Carved Sea, Floor, Cap, and Far Clip

The Deep Waters port (`iliac-puddle-no-more`) carves ocean terrain across `src/world/` and `src/underwater/` (replacing stale `scenes/deepWater/` and `systems/deepWater/` header references) and draws underwater surfaces via `src/render/deepWatersRender.js`.

- **Coastline bake and carved floor:** `src/world/deepWatersWorker.js` builds the octile (`1`, `sqrt 2`) coastline distance bake from `WOODS.WLD`, `MAPS.BSA`, and `BLOCKS.BSA`, capped at `BAKE_DISTANCE_CAP` (`255 * 16` m), cached in IndexedDB (`src/world/deepWatersBakeCache.js`, database `'daggerfall-deepwaters'`), and bounded via `PLANE_KEEP_MAX` and `PLANE_KEEP_RADIUS` in `src/world/deepWatersBake.js` and `src/world/deepWatersClient.js`. `src/world/deepWaterClassification.js` keeps the `[z, x]` `tilemapSamples` transpose. `src/world/deepWatersPixel.js`, `src/world/deepBathymetry.js`, `src/world/deepWaterFloor.js`, and `src/underwater/deepWatersWorld.js` carve every streamed pixel nearest first (surviving transient resets); world `heightAt` returns the carved seafloor while hole-edge walls enter `host.wallBuckets` (`src/underwater/deepWatersHost.js`).
- **Far clip, fog, and online room pins:** Under `FAR-CLIP1`, `terrainClipFs` (`src/render/renderer.js`) lazily appends a discard on `CLIP_SENTINEL` (`255`, `src/world/terrainSurface.js`) after `CLIP_AFTER` (`dFdy`) via `_ensureTerrainClip` and `prepareTerrainClip` for `clippedTerrainIndices` (`src/world/deepWaterCap.js`), culling `TERRAIN_SKIRT_DEPTH` (`40`) skirt segments under clipped edge tiles. `UNDERWATER_MURK` (`0.55`), `dwWaterFog` / `uDwFog`, and `TOP_FS` / `TOP_FAR_FS` (`src/world/deepWaterSurface.js`) fog world and ocean shaders per fragment. `src/platform/onlineLane.js` pins `13` gameplay keys from `src/mods/modSettings.js` (room defaults: `WaterDepth` `250`, `MaxLiveEnemies` `32`, `MaxLiveLootObjects` `192`, and `MaxLiveTreasureClusters` `12`), leaving visual toggles per-player.
