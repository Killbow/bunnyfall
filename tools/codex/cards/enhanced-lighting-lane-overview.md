---
slug: enhanced-lighting-lane-overview
title: "Enhanced Lighting Lane: Linear Pipeline, Falloff, and Tonemap"
domain: rendering
kind: overview
parent: null
files:
  - src/render/enhancedLighting.js
  - src/render/renderer.js
  - src/render/classicShadowLane.js
  - src/render/bootPrograms.js
  - src/mods/features.js
  - src/platform/pageQuery.js
  - src/scenes/interior.js
  - src/scenes/dungeon.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Enhanced-Lighting-Arc.md"
related:
  - enhanced-lighting-shadow-maps-and-casters
  - enhanced-lighting-air-pass-post-chain
  - enhanced-lighting-clusters-light-ids-and-pools
  - sky-weather-and-lighting
  - webgl2-renderer-and-textures
invariants:
  - "syncLightingLane(renderer) is the only place page doors are read: it calls setLightingLane(EL_LANE or null), and when on it also calls setExposure(exposureFor), setAir, setContact, setClusters, setShadowCache, setVolumetrics and setHaze."
  - "enhancedLightingOn holds when isEnhanced() and getPref('enhancedLighting') are true and pageParam('lighting') is not 'classic'. The feature row 'enhanced-lighting' (group 'sight') has initial: true and online: 'player'."
  - "elAttenuation = EL_LIGHT_GAIN(2) / (1 + EL_LIGHT_KNEE(16) * x^2) * clamp(1 - x^4)^2 with x = d/range, so light reaches zero exactly at range."
  - "elTonemap is extended Reinhard with white point EL_WHITE = 4. EL_EXPOSURE = 1.4 unless a positive ?exposure= overrides it."
  - "Colors are decoded with the IEC 61966-2-1 sRGB curve (elDecode/elEncode) while the lane is installed."
traps:
  - "classicShadowLane.js (IIL2) builds EL_LANE programs with the classic look restored (identity decode, clamp tonemap, (1 - d/r)^2 falloff, no specular, adaptation 1). renderer.lightingLane answers null for it, so hosts must not treat it as Enhanced Lighting."
  - "Dungeon ambient, trilight and Better Ambience fog color must all pass through dungeonAmbient/EL_DUNGEON_AMBIENT_SCALE together. Scaling one without the others makes the fog glow against a dark room."
dfu:
  - Assets/Scripts/Game/PlayerAmbientLight.cs
  - Assets/Scripts/Game/UnderwaterFog.cs
tags:
  - lighting
  - linear
  - tonemap
  - lane
  - shaders
---

# Enhanced Lighting Lane: Linear Pipeline, Falloff, and Tonemap

`src/render/enhancedLighting.js` provides a linear sRGB shading lane (`EL_LANE`, `EL_MAX_LIGHTS = 48`) wired into `Renderer` (`src/render/renderer.js`) and compiled via `src/render/bootPrograms.js`.

- **Activation and page doors (`features.js`, `pageQuery.js`):** `enhancedLightingOn` requires `isEnhanced()`, `getPref('enhancedLighting')` (`enhanced-lighting` under `sight`, `initial: true`, `online: 'player'`), and `pageParam('lighting') !== 'classic'`. `syncLightingLane(renderer)` is the sole query reader (`?lighting=classic`, `?exposure=`, `?air=off`, `?contact=off`, `?clusters=off`, `?shadowcache=off`, `?volumetrics=off`, `?iil=shadows` via `iilOnLane`, and `?perf` with `perfOn` and `PERF_EVERY = 120`), configuring `setLightingLane`, `setExposure(exposureFor)`, `setAir`, `setContact`, `setClusters`, `setShadowCache`, `setVolumetrics`, and `setHaze`.
- **Linear curve, falloff, and tonemap:** Active shaders apply IEC 61966-2-1 transfer functions (`elDecode` and `elEncode`). Point lights follow `elAttenuation = EL_LIGHT_GAIN(2) / (1 + EL_LIGHT_KNEE(16) * x^2) * clamp(1 - x^4)^2` for `x = d / range`, with `EL_SPEC_GLOSS = 24`, `EL_SPEC_STRENGTH = 0.12`, `EL_FLAT_LAMP_LIFT = 0.35`, and `EL_CONTACT_FADE_START = 0.6`. `elTonemap` uses extended Reinhard (`EL_WHITE = 4`, `EL_EXPOSURE = 1.4`).
- **Palettes, fog, and classic shadows:** `EL_FLAME_COLOR = [1.0, 0.72, 0.42]` tints white street and dungeon lanterns while preserving colored interior and IIL lights. `dungeonAmbient` scales dungeon ambient (`0.12`), trilight, and Better Ambience fog together by `EL_DUNGEON_AMBIENT_SCALE = 0.35`, while `EL_SCATTER_DENSITY_MAX = 1/40` caps fog in-scatter. `src/render/classicShadowLane.js` compiles `EL_LANE` with classic response curves while `renderer.lightingLane` returns `null`.
