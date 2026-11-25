---
slug: enhanced-lighting-shadow-maps-and-casters
title: "Enhanced Lighting Shadows: Sun Cascades, Point Casters, and Static Cache"
domain: rendering
kind: subcard
parent: enhanced-lighting-lane-overview
files:
  - src/render/shadowPass.js
  - src/render/staticBatch.js
  - src/render/bounds.js
  - src/render/renderer.js
  - src/tools/depthCopyCheck.js
  - src/scenes/frame/sceneFrame.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Enhanced-Lighting-Arc.md"
related:
  - enhanced-lighting-lane-overview
  - enhanced-lighting-clusters-light-ids-and-pools
  - yard-decor-culling-and-shadow-cubes
invariants:
  - "ShadowPass records up to SHADOW_RECORD_MAX = 6000 world draws per frame (recordShadowMesh, recordShadowTerrain, recordShadowBillboards) and replays them depth-only."
  - "Sun: SHADOW_SUN_SIZE = 2048 cascades SHADOW_CASCADES = [12, 48, 240], SHADOW_SUN_DEPTH = 600, sunAnchorFor snapped by SUN_ANCHOR_STEP = 8 / SUN_ANCHOR_HOLD = 24, SUN_CASCADE_BAND = 0.2 blend."
  - "Point: SHADOW_POINT_SIZE = 512 cube layers for up to SHADOW_POINT_CASTERS = 12 hi slots, plus a SHADOW_LO_SIZE = 256 static lo tier (SHADOW_LO_UNIT = 8, SHADOW_LO_STEP = 8, SHADOW_LO_REBUILDS = 2)."
  - "Cadence: SHADOW_NEAR_CASTERS = 2 redraw every frame, far cascade every SHADOW_FAR_CASCADE_EVERY = 2 frames, far casters every SHADOW_FAR_CASTER_EVERY = 3 frames. steadyShadows (SHADOW_TUNING.steady) removes this skipping."
traps:
  - "The static cache is copied into live layers by a full-screen triangle draw (_blitSlot, DEPTH_COPY_VS/DEPTH_COPY_FS), not by blitFramebuffer. A blit of depth arrays caused the D3D11 blink (CACHE-COPY)."
  - "Carried lights (pointCarried) never take a caster slot. Loot archive 216 (SHADOW_NO_CAST_ARCHIVES), SHADOW_LIGHT_FLATS and flats shorter than SHADOW_FLAT_MIN_HEIGHT = 0.5 do not cast."
dfu: []
tags:
  - shadows
  - cascades
  - cube-maps
  - caster-cache
---

# Enhanced Lighting Shadows: Sun Cascades, Point Casters, and Static Cache

`ShadowPass` (`src/render/shadowPass.js`) records up to `SHADOW_RECORD_MAX = 6000` world draws each frame via `recordShadowMesh`, `recordShadowTerrain`, and `recordShadowBillboards`, replaying them as depth passes for directional sun cascades and point-light cube maps.

- **Sun cascades:** Three `SHADOW_SUN_SIZE = 2048` cascades split at `SHADOW_CASCADES = [12, 48, 240]` with `SHADOW_SUN_DEPTH = 600`, `SUN_CASCADE_BAND = 0.2` blending, and `SHADOW_CASCADE_MIN_RADIUS_TEXELS = 2`. `sunAnchorFor` snaps bounds by `SUN_ANCHOR_STEP = 8` and `SUN_ANCHOR_HOLD = 24`.
- **Point casters and static cache (`depthCopyCheck.js`):** Up to `SHADOW_POINT_CASTERS = 12` active slots render into `SHADOW_POINT_SIZE = 512` cube layers, backed by a `SHADOW_LO_SIZE = 256` static lo tier (`SHADOW_LO_UNIT = 8`, `SHADOW_LO_STEP = 8`, `SHADOW_LO_REBUILDS = 2`). `pickShadowCasters` and `nearestRank` apply `CASTER_KEEP_RATIO = 0.8` hysteresis while `reserveSelfCasters` protects player-card lamps and `pointCarried` lights never claim slots. Static cache layers copy into live slots via `_blitSlot` (`DEPTH_COPY_VS` and `DEPTH_COPY_FS`) rather than `blitFramebuffer`.
- **Cadence and culling (`staticBatch.js`, `bounds.js`, `sceneFrame.js`):** The nearest `SHADOW_NEAR_CASTERS = 2` redraw every frame, the far cascade every `SHADOW_FAR_CASCADE_EVERY = 2` frames, far casters every `SHADOW_FAR_CASTER_EVERY = 3` frames (`SHADOW_FAR_HOLD = 8`, `2 * SHADOW_FAR_QUANTUM`), and swaying flora above `SHADOW_SWAY_STILL = 0.02` every `SHADOW_SWAY_EVERY = 4` frames unless `steadyShadows` (`SHADOW_TUNING.steady`) disables skipping. Dynamic placements hold for `SHADOW_DYNAMIC_HOLD = 60` frames (`SHADOW_INSTANCE_MAX = 1024`, `SHADOW_INSTANCE_REACH = 2`). Dungeon batches cull across `shadowCells` (`SHADOW_CELL_SIZE = 16`), exterior off-screen casters enter through `shadowReach` and `shadowReachBatch`, and `SHADOW_NO_CAST_ARCHIVES` (`216`), `SHADOW_LIGHT_FLATS`, and flats below `SHADOW_FLAT_MIN_HEIGHT = 0.5` skip casting.
