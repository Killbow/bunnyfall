---
slug: enhanced-environments-gating-and-upload-law
title: "Enhanced Environments Gating, Lab Grass, and Texture Upload Law"
domain: rendering
kind: overview
parent: null
files:
  - src/render/bootPrograms.js
  - src/weather/worldWeather.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/shared.js
  - src/ui/uiPrefs.js
  - src/render/labGrass.js
  - src/render/renderer.js
  - src/world/pixelBuild.js
  - src/mods/dfmodTextures.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-47.md"
related:
  - sky-weather-and-lighting
  - webgl2-renderer-and-textures
  - biome-precipitation-snowpack-and-ground
  - features-arc-lanes-and-kill-doors
invariants:
  - "Every enhanced environment term gates on `isEnhanced()` and `getPref('enhancedEnvironments')`; the sky lane also requires `?sky` not equal to `'classic'` (`src/render/bootPrograms.js`)."
  - "Lab grass mounts only when `isEnhanced()`, `getPref('enhancedEnvironments')`, and `grassDensity > 0` hold and `?grass` is not `'off'`; `discSlotCount(LAB_GRASS.span)` warms once behind the loading screen."
  - "`uploadTileArray` and `uploadTilemapTexture` perform texture uploads only and never draw, bind framebuffers, clear, set viewports, or mutate pipeline state."
  - "The game's grass stages are the lab text with the pixel, fog, lighting, and meadow edit lists applied in that order (`GAME_GRASS_VS` and `GAME_GRASS_FS`), and `applyGrassEdits` throws unless each edit's `from` text occurs exactly once."
  - "A grass blade is `GRASS_PACK_BYTES` (`16`) bytes: the height lane holds the height in its high `GRASS_HEIGHT_BITS` and each slope axis in five bits stored XOR `GRASS_SLOPE_STEPS`, so a zero word decodes as level ground, and `unpackHeightSlope` matches the vertex stage's decode."
  - "Publishing any pixel invalidates the lab grass field over that pixel's world bounds, because a cell placed earlier read ground that a flatten, road, season, or late pack rebuild has since moved."
traps:
  - "Do not add an enhanced terrain term without the `isEnhanced()` and `getPref('enhancedEnvironments')` gate."
  - "Calling `createGrassField` before `discSlotCount` warm-up repays the slot sweep mid-frame, and mutating GL state inside upload helpers breaks `exterior.js` frame assumptions."
dfu: []
tags:
  - enhanced-environments
  - grass
  - precipitation
  - webgl2
  - textures
---

# Enhanced Environments Gating, Lab Grass, and Texture Upload Law

Enhanced environment rendering gates terrain, sky, weather, and grass terms behind preference and URL checks while keeping texture uploads free of WebGL pipeline mutations (`src/render/bootPrograms.js`, `src/weather/worldWeather.js`, `src/render/renderer.js`, `features-arc-lanes-and-kill-doors`).

## Environment Gating and Query Switches

- **Dual preference gate (`src/render/bootPrograms.js`, `src/weather/worldWeather.js`, `src/ui/uiPrefs.js`, `src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/shared.js`):** Every enhanced environment term requires both `isEnhanced()` and `getPref('enhancedEnvironments')`. The sky lane also checks that `?sky` is not `'classic'`. Live URL query switches include `?sky=classic`, `?grass=off`, `?rain=<n>`, `?weather=<type>`, and `?season=<name>`.
- **Lab grass warm-up (`src/render/labGrass.js`, `src/weather/worldWeather.js`):** Lab grass mounts only when `isEnhanced()`, `getPref('enhancedEnvironments')`, and `grassDensity > 0` hold and `?grass` is not `'off'`. `discSlotCount(LAB_GRASS.span)` warms once behind the loading screen before `createGrassField` runs so the slot sweep never stalls rendering.

## Texture Upload Law and Tile Arrays

- **Upload purity (`src/render/renderer.js`, `src/world/pixelBuild.js`, `src/mods/dfmodTextures.js`):** `uploadTileArray` and `uploadTilemapTexture` perform texture uploads only and never draw, bind framebuffers, clear, set viewports, or mutate WebGL pipeline state. Outside `src/render/renderer.js`, callers access `tileArrays` through renderer methods instead of mutating arrays directly.
