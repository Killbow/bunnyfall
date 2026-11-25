---
slug: volumetric-clouds-shadow-shafts-and-sweep
title: "Cloud Shadow Reader, Sun Shafts, Air Haze, and Sweep Pacing"
domain: rendering
kind: subcard
parent: volumetric-clouds-overview
files:
  - src/render/cloudShadow.js
  - src/render/airPass.js
  - src/render/volumetricClouds.js
  - src/render/renderer.js
  - src/render/labGrass.js
  - src/render/enhancedLighting.js
  - src/render/windWisps.js
  - src/combat/fpArm.js
  - src/scenes/shared.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Volumetric-Clouds-Arc.md"
related:
  - volumetric-clouds-overview
  - enhanced-lighting-air-pass-post-chain
  - enhanced-lighting-shadow-maps-and-casters
invariants:
  - "CLOUD_SHADOW_GLSL lives in leaf src/render/cloudShadow.js so renderer.js, airPass.js and labGrass.js can interpolate it without an import cycle. An amount of 0 (classic skin, interiors) answers full sun."
  - "`cloudShadowAt` (`src/render/cloudShadow.js`) eases toward `uCloudShadowFar` beyond `CLOUD_SHADOW_RIM = 0.8`, while `cloudShadowNearest` clamps in map UV rather than world meters."
  - "sweepFramesFor(cover, cells) = SWEEP_FRAMES (8) * 2^round(log2(sweepCost)), capped at SWEEP_FRAMES_MAX = 32. Each cell adds CELL_SWEEP_COST = 0.15 (RAIN-FPS)."
traps:
  - "renderCharacterSprite with lensLocal: true (the fpArm viewmodel) borrows _cloudShadow off for the draw, so the arm never jumps in brightness at recenters."
  - "WISP_CLOCK_PERIOD = 400 s and the wobble frequencies are whole cycles over it. Never feed raw session seconds to uTime."
dfu: []
tags:
  - cloud-shadow
  - light-shafts
  - air-haze
  - performance
  - wind-wisps
---

# Cloud Shadow Reader, Sun Shafts, Air Haze, and Sweep Pacing

`src/render/cloudShadow.js` exports the leaf `CLOUD_SHADOW_GLSL` sampler shared across `src/render/renderer.js`, `src/render/airPass.js`, and `src/render/labGrass.js` without import cycles, pairing ground cloud shadows with crepuscular rays, volumetric air haze, wind wisps, and adaptive sky-map sweep pacing.

- **Ground shadow reader and viewmodel isolation (`src/render/cloudShadow.js`, `src/scenes/shared.js`, `src/combat/fpArm.js`):** `cloudShadowAt` eases into `uCloudShadowFar` past `CLOUD_SHADOW_RIM = 0.8` while `cloudShadowNearest` clamps in map UV. When amount equals `0` (classic skin or interiors), the reader returns full sun; under volumetric clouds, `SHADOW_AMOUNT = 1.0` dims direct sun (`farSunFactor()` equals `1 - 0.7 * cover^1.6`) without altering sky ambient, and `labGrass.js` multiplies grass sun by `cloudShadowAt(rootW)`. First-person viewmodels (`renderCharacterSprite` with `lensLocal: true`) temporarily disable `_cloudShadow` so the weapon arm never jumps in brightness on grid recenters.
- **Sun shafts, air haze, wisps, and sweep pacing (`src/render/airPass.js`, `src/render/enhancedLighting.js`, `src/render/windWisps.js`, `src/render/volumetricClouds.js`):** Air-pass sun shafts sample the shadow deck at player foot coordinates and directional sky-map alpha. Air haze marches `AIR_HAZE_STEPS = 12` jittered samples to `AIR_HAZE_REACH = 3000` m (`AIR_HAZE_G = 0.6`, `AIR_HAZE_ISO = 0.3`, `AIR_HAZE_GAIN = 1 / AIR_HAZE_PROBE_KEY` with `0.9`; `?haze=off` disables haze while keeping shafts). `windWisps.js` wraps `uTime` to `WISP_CLOCK_PERIOD = 400` s. `sweepFramesFor(cover, cells)` scales `SWEEP_FRAMES = 8` by `2^round(log2(sweepCost))` up to `SWEEP_FRAMES_MAX = 32` (`CELL_SWEEP_COST = 0.15` per cell).
