---
slug: perf-meter-zones-ground-order-and-telegraph-bounds
title: "Perf Meter CPU Zones, Ground-Last Draw Order, and Tight Telegraph Bounds"
domain: rendering
kind: subcard
parent: performance-rig-overview
files:
  - src/render/perfMeter.js
  - src/scenes/frame/sceneFrame.js
  - src/scenes/frame/combatFrame.js
  - src/scenes/frame/hudFrame.js
  - src/scenes/exterior.js
  - src/render/renderer.js
  - src/render/gateTelegraph.js
  - src/render/lightId.js
  - tools/fb1013ePerfProbe.mjs
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Rig.md"
related:
  - performance-rig-overview
  - performance-priority-overview
  - enhanced-lighting-clusters-light-ids-and-pools
  - enhanced-lighting-shadow-maps-and-casters
  - webgl2-renderer-and-textures
invariants:
  - "PerfMeter.markCpu(name) tiles main-thread CPU spans. PERF-ZONE2 names them 'bodies' and 'ring' (sceneFrame.js), 'arrows' and 'rig' (combatFrame.js), and 'hud' (hudFrame.js)."
  - "PerfMeter.stopCpu() closes the open span without opening another. hudFrame.js calls it at the end of the frame so the rAF/vsync wait is not counted in 'hud' (PERF-READ1)."
  - "The renderer opens the meter frame only for a world frame (_perfOpen) and closes it once, so menu or background resolves never leak into world spans."
  - "GROUND-LAST: ground is drawn after every opaque mesh so early-Z rejects covered ground. NEAR-FIRST walks pixels nearest first (sceneFrame.js groundQueue)."
  - "AOE-PERF: mark and path/tether quads are bounded by telegraphMarkReach and telegraphStrip instead of TELEGRAPH_REACH = 4. The fragment stage is unchanged."
  - "`adoptLight(e, src)` (`src/render/lightId.js`) keys each light by producer so a moving light never invalidates static shadow caches owned by sibling lights."
traps:
  - "Leaving a CPU span open across the frame boundary makes the last zone absorb vsync idle time."
  - "Widening telegraph quads back to `TELEGRAPH_REACH` (`4`) instead of `telegraphMarkReach` and `telegraphStrip` (`src/render/gateTelegraph.js`) restores boss-fight fragment overdraw."
dfu: []
tags:
  - perf-meter
  - profiling
  - draw-order
  - overdraw
  - telegraphs
---

# Perf Meter CPU Zones, Ground-Last Draw Order, and Tight Telegraph Bounds

World frame telemetry, opaque draw ordering, tight telegraph geometry, and stable light identities isolate CPU/GPU costs and trim fragment overdraw.

- **PerfMeter CPU and GPU zones (`src/render/perfMeter.js`, `sceneFrame.js`, `combatFrame.js`, `hudFrame.js`, `renderer.js`):** `?perf=cpu` enables main-thread CPU zones and `?perf=zones` enables GPU timer zones. `PerfMeter.markCpu(name)` tiles `'bodies'` and `'ring'` (`sceneFrame.js`), `'arrows'` and `'rig'` (`combatFrame.js`), and `'hud'` (`hudFrame.js`). `hudFrame.js` calls `PerfMeter.stopCpu()` at frame end so vsync wait time never inflates `'hud'`, while `renderer.js` opens the meter only on world frames (`_perfOpen`).
- **Ground-last draw order and telegraph bounds (`sceneFrame.js`, `exterior.js`, `src/render/gateTelegraph.js`, `tools/fb1013ePerfProbe.mjs`):** `groundQueue` walks nearest pixels first and draws ground after all opaque meshes so early-Z depth testing rejects occluded terrain. In `gateTelegraph.js`, mark, path, and tether quads use tight bounds (`telegraphMarkReach` and `telegraphStrip`) rather than `TELEGRAPH_REACH = 4`, reducing telegraph rasterization from `3.4` to `2.1` screen equivalents in `fb1013ePerfProbe.mjs` without altering fragment shaders.
- **Stable light identities (`src/render/lightId.js`):** `adoptLight(e, src)` keys lights by producer (alongside `withCourtLights` in `src/world/gateArena.js` and `FX_LIGHT_MS = 450` in `src/render/gateFx.js`), keeping moving lights from invalidating static shadow caches across the `SHADOW_POINT_CASTERS = 12` (`SHADOW_POINT_SIZE = 512`) point-shadow slots.
