---
slug: yard-decor-culling-and-shadow-cubes
title: "Yard Decor Culling, Merging, and Shadow Instance Cubes"
domain: rendering
kind: subcard
parent: performance-priority-overview
files:
  - src/homes/decorRoom.js
  - src/homes/homeYards.js
  - src/net/yardRange.js
  - src/net/decorLaw.js
  - src/world/merchantYards/merchantYardsHost.js
  - src/render/shadowPass.js
  - src/render/staticBatch.js
  - src/player/collider.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Priority.md"
related:
  - performance-priority-overview
  - homes-camps-guilds-and-territories
  - webgl2-renderer-and-textures
invariants:
  - "decorCullVerdict(planes, box, reaches) answers DECOR_DRAW, DECOR_SHADOW, or DECOR_SKIP each frame from planes built off the current frame's view."
  - "YARD_RANGE_TIERS = [0, 75, 150, YARD_DRAW_M]; YARD_DRAW_M = 300 and one's own yard always draws to YARD_DRAW_M."
  - "Shadow instance memo goes spatial past SHADOW_INSTANCE_LINEAR = 64 placements, capped at SHADOW_INSTANCE_MAX = 1024, cubes of SHADOW_INSTANCE_REACH = 2 offset by SHADOW_INSTANCE_PHASE."
traps:
  - "A decor model with no geometry yet has no box and is not culled."
  - "The per-face `_faceDyn` flag (PERF-FACE) must be reset when a point light cache slot is dropped."
  - "`entrySeen` (`src/homes/decorRoom.js`) is defined at module scope so batch culling allocates no closure per call; keep it there."
dfu: []
tags:
  - yards
  - decor
  - culling
  - shadows
  - static-batch
---

# Yard Decor Culling, Merging, and Shadow Instance Cubes

Exterior and interior decorations bound draw calls and shadow work through per-frame frustum verdicts, delayed static batch merges, spatial shadow cubes, and coarse collider buckets.

## Decor Culling and Static Merging

- **Per-frame cull verdict (`decorRoom.js`, `homeYards.js`, `yardRange.js`, `decorLaw.js`):** Each frame, `decorCullVerdict(planes, box, reaches)` evaluates view planes and returns `DECOR_DRAW`, `DECOR_SHADOW`, or `DECOR_SKIP`, while `decorPieceSeen` and `decorBoxSeen` enforce the `YARD_MIN_ANGLE = 1/300` angular-size floor. Models without loaded geometry lack a box and bypass culling. Yard distance follows `YARD_RANGE_TIERS = [0, 75, 150, YARD_DRAW_M]` with `YARD_DRAW_M = 300`, though the local player's own yard always draws to `YARD_DRAW_M`. Placements cap at `DECOR_YARD_CAP = 120` per yard and `DECOR_YARDS_TOWN_MAX = 6500` per town.
- **Settled static batches (`homeYards.js`, `merchantYardsHost.js`, `staticBatch.js`):** Yard state syncs at `YARD_SYNC_S = 0.5`. After edits settle for `DECOR_MERGE_SETTLE_MS = 500` ms, `mergeDecorModels` combines geometry through `StaticBatchBuilder` at `YARD_MERGES_A_FRAME = 1`.

## Shadow Instance Cubes and Collider Buckets

- **Spatial shadow memo (`shadowPass.js`):** Beyond `SHADOW_INSTANCE_LINEAR = 64` placements (up to `SHADOW_INSTANCE_MAX = 1024`), shadow instance lookups switch to spatial cubes of `SHADOW_INSTANCE_REACH = 2` offset by `SHADOW_INSTANCE_PHASE`. Dropping a point-light cache slot resets `_faceDyn`.
- **Coarse collider grid (`collider.js`):** Streamed colliders bin into `BROAD_COARSE_CELL = 256` buckets, re-file on `onFloatingFrame`, and filter moving buckets via `moverReaches`.
