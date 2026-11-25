---
slug: shader-warm-and-time-sliced-budgets
title: "Async Shader Compile, Snow Budget, and Virtual Trade Rows"
domain: rendering
kind: subcard
parent: performance-priority-overview
files:
  - src/render/glProgram.js
  - src/render/playPrograms.js
  - src/render/auraRing.js
  - src/weather/snowCoverHost.js
  - src/ui/virtualRows.js
  - src/ui/landingTiles.js
  - src/ui/enhancedTrade.js
  - src/ui/enhancedPlayerTrade.js
  - src/systems/livingWorld/trips.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Priority.md"
related:
  - performance-priority-overview
  - webgl2-renderer-and-textures
  - sky-weather-and-lighting
invariants:
  - "Programs compile in parallel via KHR_parallel_shader_compile, polled with COMPLETION_STATUS_KHR; without the extension they compile synchronously."
  - "Snow cover asks share one SNOW_COVER.frameMs = 12 ms window (budgetMs = 3 per ask)."
  - "Trade windows render through virtualRows with measured row heights and preserved scroll."
traps:
  - "Parallel compile must never skip critical combat indicators; such passes compile on demand (compiledPass)."
  - "Snow sweeps (beginSweep/sweepUntil, SWEEP_FLATS_A_READ = 64) resume across frames without losing progress."
dfu: []
tags:
  - shaders
  - async-compile
  - snow
  - ui-virtualization
  - time-slice
---

# Async Shader Compile, Snow Budget, and Virtual Trade Rows

Shader prewarming, snow accumulation sweeps, living-world route caches, and large trade inventories spread heavy work across frames or virtualize DOM nodes to prevent frame spikes.

## Parallel Shader Compilation

- **Async compile and combat fallback (`glProgram.js`, `playPrograms.js`, `auraRing.js`):** When WebGL exposes `KHR_parallel_shader_compile`, `glProgram.js` polls `COMPLETION_STATUS_KHR` while `warmPrograms` and `startPrograms` (`src/render/playPrograms.js`) prewarm shaders, including `AURA_PROGRAMS` (`auraPrograms` in `src/render/auraRing.js`), during idle frames. Without the extension, shaders compile synchronously. Critical combat indicators never skip rendering while waiting on background compilation; `compiledPass` compiles required passes on demand.

## Time-Sliced Snow Cover and Route Bounds

- **Snow cover budget (`snowCoverHost.js`):** Pending snow cover requests share a `SNOW_COVER.frameMs = 12` ms per-frame window, allocating `budgetMs = 3` ms per request. `beginSweep` and `sweepUntil` advance in batches of `SWEEP_FLATS_A_READ = 64` flats and resume cleanly across frames.
- **Road choice cache (`trips.js`):** Living-world trip planning in `src/systems/livingWorld/trips.js` caps cached `roadChoices` at `ROAD_CHOICES_KEPT = 2048`.

## Virtualized Trade UI

- **Virtual rows and single-pass tiles (`virtualRows.js`, `enhancedTrade.js`, `enhancedPlayerTrade.js`, `landingTiles.js`):** NPC and player trade lists render through `virtualRows` with measured row heights and preserved scroll offsets, while `landingTiles.js` loads trade tiles in one pass.
