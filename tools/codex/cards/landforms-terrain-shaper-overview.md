---
slug: landforms-terrain-shaper-overview
title: "Landforms Terrain Shaper Inside the DFU Kernel"
domain: world
kind: overview
parent: null
files:
  - src/world/landforms.js
  - src/world/terrainSampler.js
  - src/world/terrainTiles.js
  - src/world/terrainGen.js
  - src/world/terrainGenClient.js
  - src/scenes/shared.js
  - src/mods/features.js
  - src/render/farRing.js
  - src/scenes/world.js
  - src/world/terrainGenWorker.js
routes: []
tables: []
replacesBible:
  - "03-World/Landforms.md"
related:
  - landforms-roads-rivers-and-town-pulls
  - landforms-climate-hills-and-mountain-peaks
  - landforms-save-frame-and-restand
  - pixel-streaming-and-origin-shift
  - shared-ground-agreement-overview
  - roads-network-overview
invariants:
  - "At or under LANDFORM_KNEE (SCALED_BEACH_ELEVATION 40 + BEACH_JITTER 1.5 = 41.5 kernel units) a height is returned exactly as DFU's kernel made it."
  - "A shaped height over the knee is never lower than min(its own raw lifted height, LANDFORM_FLOOR = LANDFORM_KNEE + 0.5)."
  - "The shaper is a pure function of world position plus world data (WOODS.WLD, road network, landformSites, landformClimates), so a pixel-edge sample is the same number from both pixels."
  - "Off or on the classic skin, `landformsOn()` returns false, `sampleKernel` gets `landform = null`, and the kernel matches DFU to the bit."
  - "Tiles are classified on DFU `classic` samples through DFU blend (`terrainGen.js` `generateTileData(classic ?? samples)`); landforms move ground, never a tile."
  - "Kernel jobs and replies cross the worker boundary whole, by object spread, so a new kernel input or output is never dropped by a hand-copied field list; the fallback path resolves the whole object too."
traps:
  - "The kill door `?landforms=off` is ignored online: the feature is forced on in online pages because it is the room's ground."
  - "Only the small-heightmap term `low` is lifted; lifting ground noise produces 25 m spikes."
  - "Adding a new terrain reader that bypasses sampleKernel's `landform` argument splits the ground between readers."
dfu:
  - Assets/Scripts/Terrain/DefaultTerrainSampler.cs
  - Assets/Scripts/Terrain/TerrainHelper.cs
tags:
  - landforms
  - terrain
  - heightmap
  - kernel
  - feature-flag
---

# Landforms Terrain Shaper Inside the DFU Kernel

The landforms shaper (`src/world/landforms.js`) lifts and sculpts overworld height inside `sampleKernel(woods,px,py,hDim,groundNoise,landform,classic)` (`src/world/terrainSampler.js`), where `kernelTerms` and `kernelWindows` expose the DFU bicubic `base` and `noise` terms.

- **Feature gate and classic parity (`src/mods/features.js`, `src/scenes/shared.js`, `src/world/terrainGen.js`, `src/world/terrainTiles.js`):** Feature row `landforms` (group `'world'`, kinds `['enhanced']`, control key `'landforms'`) is composed by `landformsOn`. Online pages ignore `?landforms=off` to preserve room ground. When off or on the classic skin, `sampleKernel` gets `landform=null` for bit-exact DFU output, and `generateTileData(classic??samples)` classifies tiles on `classic` samples.
- **Knee, relief lift, and cliff fade (`src/world/landforms.js`, `src/render/farRing.js`, `src/scenes/world.js`):** Heights at or under `LANDFORM_KNEE` (`SCALED_BEACH_ELEVATION` `40` + `BEACH_JITTER` `1.5` = `41.5` units; `1` unit = `1.25` m, `1` sample = `6.4` m) return unchanged, and shaped heights above it never drop below `min(rawLifted,LANDFORM_FLOOR=42.0)` up to `LANDFORM_CEILING` (`MAX_TERRAIN_HEIGHT` `1539` + `reliefLift(1016)` + `HILLS_TOP` `499.2` = `2915.25`). Only the small-heightmap `low` term lifts via `reliefLift(low)` (`e=min(low,127*BASE_HEIGHT_SCALE)-knee`, `0.9*e*smoothstep` over `[200,900]` in `LANDFORM_DIALS.relief`). `cliffFadeAt` fades lift from `cliff.from=1` to `cliff.full=3` pixels from sea (`CLIFF_REACH`), quantized to `1024`ths for `ringHeight` and `reliefByteHeight`. `world.js` passes `landformSites` and `landformClimates` to `terrainGen.setLandformTables` (`src/world/terrainGenClient.js`).
