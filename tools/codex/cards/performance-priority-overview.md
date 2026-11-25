---
slug: performance-priority-overview
title: "Performance Priority: Frame Budget, Presets, and Storage Cache"
domain: rendering
kind: overview
parent: null
files:
  - src/scenes/world.js
  - src/scenes/frame/motorFrame.js
  - src/scenes/frame/inputFrame.js
  - src/scenes/frame/skyFrame.js
  - src/platform/graphicsPresets.js
  - app/lib/fileStorage.cjs
  - src/ai/cover.js
  - src/scenes/shared.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Priority.md"
related:
  - yard-decor-culling-and-shadow-cubes
  - peer-range-and-distant-ship-hulls
  - horse-teams-pose-cadence-and-dye-budget
  - shader-warm-and-time-sliced-budgets
  - four-hosts-and-modal-frame
  - webgl2-renderer-and-textures
invariants:
  - "Per-frame work tagged PERF-V8 runs as its own closure (such as frameMotor, frameLook, or frameSnowCover) so the world frame stays under three quarters of V8's optimizing bytecode ceiling."
  - "Graphics presets: High is the shipped default; PRESET_PARTS = ['steadyShadows'], off on Low only."
  - "Desktop file storage keeps read/written values for readTtlMs = 1000 ms (scanTtlMs = 2000) before re-reading disk."
traps:
  - "Inlining a loop, try, or spread into the world frame can push registers wide and lose JIT optimization; add a PERF-V8 closure instead."
  - "Visual fidelity is not reduced for speed unless a setting is explicitly designated."
dfu: []
tags:
  - performance
  - v8
  - frame-budget
  - presets
  - storage-cache
---

# Performance Priority: Frame Budget, Presets, and Storage Cache

World rendering prioritizes steady frame rates around placed objects, crowded areas, and extended render ranges without lowering visual fidelity unless a user setting explicitly turns a feature down.

## V8 Frame Closures and Memory Bounds

- **PERF-V8 phase closures (`world.js`, `src/scenes/frame/*.js`):** Per-frame steps run inside dedicated closures such as `frameMotor` (`src/scenes/frame/motorFrame.js`), `frameLook` (`src/scenes/frame/inputFrame.js`), and `frameSnowCover` (`src/scenes/frame/skyFrame.js`). Keeping loops, `try` blocks, and spreads out of the top-level world update keeps bytecode below three quarters of V8's optimizing compiler ceiling.
- **Exact cover and sky bounds (`cover.js`, `shared.js`):** In `src/ai/cover.js`, `CELL_EXACT = 16` preserves exact sizing on small cover cells. In `src/scenes/shared.js`, `SKY_FILES_KEPT = 2` caps retained sky archive files in memory.

## Graphics Presets and Desktop Storage Cache

- **Presets (`graphicsPresets.js`):** High is the default graphics preset. `PRESET_PARTS = ['steadyShadows']` disables `steadyShadows` only on Low.
- **Desktop TTL cache (`app/lib/fileStorage.cjs`):** The Electron storage bridge caches read and written values in memory for `readTtlMs = 1000` ms and directory scans for `scanTtlMs = 2000` ms before hitting disk again.

## Subcards

- `yard-decor-culling-and-shadow-cubes`: yard distance tiers, static batch merging, and spatial shadow cubes.
- `peer-range-and-distant-ship-hulls`: peer visibility tiers, distant hull shedding, and far-boat stepping.
- `horse-teams-pose-cadence-and-dye-budget`: camera-scaled horse posing, harness sleep, and coat dye budgets.
- `shader-warm-and-time-sliced-budgets`: parallel shader compilation, snow cover time-slicing, and virtualized trade rows.
