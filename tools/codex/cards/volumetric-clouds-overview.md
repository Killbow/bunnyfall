---
slug: volumetric-clouds-overview
title: "Volumetric Clouds: Sky Map, Noise Volumes, and Shadow Deck"
domain: rendering
kind: overview
parent: null
files:
  - src/render/volumetricClouds.js
  - src/render/cloudNoise.js
  - src/render/renderTarget.js
  - src/render/cloudShadow.js
  - src/render/bootPrograms.js
  - src/render/dynamicSkiesBridge.js
  - src/render/perfMeter.js
  - src/scenes/shared.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Volumetric-Clouds-Arc.md"
related:
  - sky-weather-and-lighting
  - enhanced-lighting-air-pass-post-chain
  - biome-precipitation-air-and-phase
  - volumetric-clouds-living-field-and-deck
  - volumetric-clouds-rain-curtains-and-cirrus
  - volumetric-clouds-shadow-shafts-and-sweep
invariants:
  - "Both the hemisphere sky map and the ground shadow map sample `CLOUD_FIELD_GLSL` with identical `uShift` recentering, wind drift, and clocks."
  - "Field periods align to whole map pixels (`SHAPE_METRES = 15` px, `DETAIL_METRES = 1` px, `VARIATION_METRES = 80` px, `MOTTLE_METRES = 5` px), wrapping drift and shift to `FIELD_PERIOD_METRES = 240` px before upload to preserve float32 precision."
  - "`SHADOW_EXTENT` equals `PIXEL_METRES * 16` (`13107` m), and `shadowOrigin` snaps the shadow square to the `819.2` m pixel grid so recentering shifts whole texels at every quality tier."
traps:
  - "renderTarget.js creation (createRenderTarget, createVolume) never queries GL state. Callers own the binding and viewport restore."
  - "Under Dynamic Skies, mod cloud sheets stand down (`cloudsExternal`); `?clouds=off` restores mod sheets and disables the volumetric field."
dfu: []
tags:
  - clouds
  - volumetric
  - sky
  - raymarch
  - noise
---

# Volumetric Clouds: Sky Map, Noise Volumes, and Shadow Deck

`VolumetricClouds` (`src/render/volumetricClouds.js`) raymarches a hemisphere sky map in stripes with fixed per-texel jitter and projects a ground shadow map (`src/render/cloudShadow.js`). `skyChoice` (`src/render/bootPrograms.js`) enables the pass unless `?clouds=off` is set, `?cloudcell=<weather>[,ahead[,radius]]` hangs a test cell, and `?perf=zones` (`src/render/perfMeter.js`) splits GPU pass times.

- **Noise volumes and target purity (`src/render/cloudNoise.js`, `src/render/renderTarget.js`):** The GPU bakes a `SHAPE_SIZE = 128` RGBA volume (Perlin-Worley in R; Worley fbm 8, 16, and 32 in G, B, and A) and a `DETAIL_SIZE = 32` volume. `createRenderTarget` and `createVolume` never query WebGL state, so callers restore bindings and viewports. `COMPOSITE_FS` filters the sky map through `mapBicubic` (four bilinear taps).
- **Period alignment, quality tiers, and mod bridge (`src/scenes/shared.js`, `src/render/dynamicSkiesBridge.js`):** Both maps sample `CLOUD_FIELD_GLSL` with identical `uShift`, drift, and clocks. Periods (`SHAPE_METRES = 15`, `DETAIL_METRES = 1`, `VARIATION_METRES = 80`, `MOTTLE_METRES = 5`) wrap to `FIELD_PERIOD_METRES = 240` px, and `shadowOrigin` snaps `SHADOW_EXTENT` (`PIXEL_METRES * 16`, `13107` m) to the `819.2` m grid across `QUALITY` tiers (`lo`, `default`, and `hi` via `?clouds=<tier>` or `cloudQuality`). `cloudsExternal` suppresses Dynamic Skies sheets while `cloudsStateUnderMod` grays the horizon by eased `skyRow`.
