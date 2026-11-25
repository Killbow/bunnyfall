---
slug: biome-precipitation-snowpack-and-ground
title: "Snowpack SWE Lattice, Snowlines, and Ground Snow Cover"
domain: rendering
kind: subcard
parent: biome-precipitation-overview
files:
  - src/weather/snowpack.js
  - src/weather/snowpackStore.js
  - src/weather/snowCoverHost.js
  - src/render/snowCoverGlsl.js
  - src/render/renderer.js
  - src/world/pixelBuild.js
  - src/world/seasonReskin.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Biome-Precipitation.md"
related:
  - biome-precipitation-overview
  - biome-precipitation-air-and-phase
  - shader-warm-and-time-sliced-budgets
  - pixel-streaming-and-origin-shift
invariants:
  - "Each step sets SWE = min(capMm, max(0, SWE + snow - melt)) every SNOWPACK.stepMinutes = 180 on a fixed event-clock grid. The levels are { from: -600, step: 200, count: 23 }, which spans -600 m to 3800 m."
  - "SWE never decreases with altitude, so snowlineOf reduces a pack to its 10/50/90% cover heights, and coverAtHeight and the shader's snowAtHeight interpolate through them."
  - "The snow year starts at MIDSUMMER_MINUTE (COLDEST_DAY + 180). A point spins the prior year from zero only where meltsOut() is false."
  - "SnowpackLattice samples map-pixel corners every SNOW_COVER.spacing = 2 pixels (cornerField). The host window has radius 5 (11 x 11 points), and packNow blends the two bounding steps."
traps:
  - "SNOW-FACE removed every slope test, so steep faces keep the snow their height gives."
  - "LANE-TURN means a switch between the classic and enhanced lanes rebuilds the pixel (markRebuild). reskinPixelNow refuses lane turns and handles only in-lane season turns."
dfu:
  - Assets/Scripts/Terrain/TerrainMaterialProvider.cs
  - Assets/Scripts/Terrain/TerrainNature.cs
tags:
  - snowpack
  - swe
  - snowline
  - ground-snow
  - twin-array
---

# Snowpack SWE Lattice, Snowlines, and Ground Snow Cover

`src/weather/snowpack.js`, `src/weather/snowpackStore.js`, and `src/weather/snowCoverHost.js` integrate snow water equivalent (SWE) across altitude bands and stream snowline textures to the terrain shader and nature placement passes.

## SWE Integration and Snowlines

Every `SNOWPACK.stepMinutes = 180` on the event-clock grid, `stepPack` updates `SWE = min(capMm, max(0, SWE + snow - melt))` across `23` altitude levels from `-600` m to `3800` m (`step: 200`), using rates `{ rain: 1.3, thunder: 3.3, snow: 0.8 }` mm/h, degree-hour melt `4 / 24`, `rainMelt: 4.19 / 334`, `fullMm: 10`, and `capMm: 2000`. Closed-form `positiveCosIntegral` averages four Gauss points per quarter-day, skipping empty steps when `stepAirFloor >= RAIN_ALL_C`. The snow year starts at `MIDSUMMER_MINUTE` (`COLDEST_DAY + 180`) and spins the prior year from zero only where `meltsOut()` is false. Because SWE rises monotonically with height, `snowlineOf` extracts 10%, 50%, and 90% cover elevations interpolated by `coverAtHeight` and `snowAtHeight` (`src/render/snowCoverGlsl.js`), without slope culling (`SNOW-FACE`).

## Lattice Window, Twin Arrays, and Reskinning

`SnowpackLattice` samples `cornerField` every `SNOW_COVER.spacing = 2` pixels across a radius `5` (`11 x 11`) window (`SNOW_COVER` budgets `budgetMs: 3`, `frameMs: 12`, `saveMs: 60000`, and `winter: 0.5`), and `packNow` blends bounding steps. `setSnowFrame` binds snowlines on `SNOW_LINES_UNIT` (`23`) over `2 x TWIN_LAYERS` (`112`) layers under `twinKey` `'twin:<summer>'`. Three-octave `SNOW_GROUND` patches match CPU `snowCoverAt` (`buries` and `winterAt`), while `winterNear` feeds Snowfall, buildings flip at `SNOW_COVER.winter`, flats use `flatDraw`, and lane switches force `markRebuild` (`LANE-TURN` in `src/world/seasonReskin.js`).
