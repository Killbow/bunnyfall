---
slug: bantha-jungle-haze-and-culling
title: "Jungle Haze, Easing, and Transmission Culling"
domain: rendering
kind: subcard
parent: bantha-jungle-overview
files:
  - src/world/jungle/jungleHaze.js
  - src/render/hazeGlsl.js
  - src/render/renderer.js
  - src/world/jungle/jungleHost.js
  - src/scenes/world.js
  - src/scenes/shared.js
replacesBible:
  - "03-World/Bantha-Jungle.md"
related:
  - bantha-jungle-overview
  - sky-weather-and-lighting
  - webgl2-renderer-and-textures
invariants:
  - "Haze share uses a smoothstep across JUNGLE_HAZE.edge (320 meters outside to 760 meters inside the jungle boundary), wider than the tree edge so humid air drifts past the outer canopy."
  - "Haze is per-frame state: setJungleHaze arms uJungleHaze for the exterior pass, and Renderer.beginFrame zeroes it unless re-armed so interiors, dungeons, and other passes never inherit it."
  - "hazeHides only removes an occluded map pixel from the render visibility list (pixelVisible in src/scenes/world.js) and never stops terrain streaming or collision physics."
  - "A bounding box is culled only when ray transmittance drops below JUNGLE_HAZE.cull (1/512)."
  - "Camera movement exceeding jump (250 meters) in one frame snaps share, density, and floor elevation to target; smaller moves lag exponentially (share 1.4 s, density 2.5 s, floor 3.5 s)."
traps:
  - "Every shader sharing scene fog must read uJungleHaze and fogFactorAt from src/render/hazeGlsl.js; skipping them renders unhazed geometry through the mist."
  - "fogColorWith blends weather fog and jungle haze at weighAt (300 meters) into one frame fog color; passing the raw weather fog color mismatches the sky pass (hazeSkyUniform)."
tags:
  - jungle
  - haze
  - fog
  - culling
  - rendering
---

# Jungle Haze, Easing, and Transmission Culling

`src/world/jungle/jungleHaze.js` and `src/render/hazeGlsl.js` model low-lying tropical mist that blends with weather fog, tints the sky dome, and culls distant exterior geometry when optical transmittance drops near zero.

## Vertical Mist Profile, Weather, and Easing

Haze share ramps across `JUNGLE_HAZE.edge` (`320` meters outside to `760` meters inside). At the jungle floor, base extinction density is `0.0055` per meter (50% light transmission at `126` meters) across a `28`-meter layer with a `90`-meter vertical falloff and an `8`-meter transparent camera bubble (`start`). Density scales by time of day, weather (`1.4` in fog, `1.42` in thunder, and `1.3` in rain), and drifting banks (`hazeDrift`, `540`-meter cell, `0.24` amplitude, `1.6` m/s speed).

`stepHaze` eases share (`1.4` s), density (`2.5` s), and floor height (`3.5` s), snapping immediately whenever the camera moves more than `jump` (`250` meters) in one frame. `hazeColorOf` shifts toward gray by `0.42` and multiplies by `[0.88, 1.0, 0.85]`, while `fogColorWith` blends weather fog and haze at `weighAt` (`300` meters) to match `hazeSkyUniform`.

## Per-Frame Arming and Transmission Culling

`src/world/jungle/jungleHost.js` arms `setJungleHaze` each exterior frame (unless disabled via `?junglehaze=off` in `jungleHazeOn`, `src/scenes/shared.js`), and `Renderer.beginFrame` (`src/render/renderer.js`) resets `uJungleHaze` if not re-armed. `hazeMean` integrates ray optical depth, and `hazeHides` removes map pixels from `pixelVisible` (`src/scenes/world.js`) once transmittance falls below `JUNGLE_HAZE.cull` (`1/512`).
