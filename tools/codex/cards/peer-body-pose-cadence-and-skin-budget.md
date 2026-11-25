---
slug: peer-body-pose-cadence-and-skin-budget
title: "Peer Body Pose Cadence, Skin Budget, Culling, and Spare Rigs"
domain: multiplayer
kind: subcard
parent: performance-rig-overview
files:
  - src/net/peerBodies.js
  - src/combat/fpArm.js
  - src/net/online.js
  - src/render/renderer.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Rig.md"
related:
  - performance-rig-overview
  - online-coop-peer-presence-and-crowd-fans
  - npc-lanes-frame-budget-and-build-gate
  - mw-gpu-skinning-and-sprite-batch
invariants:
  - "`POSE_CADENCE = [[10, 1], [25, 2], [Infinity, 3]]` (`src/net/peerBodies.js`) poses bodies every frame within `10` m, every second frame within `25` m, and every third frame beyond `25` m via `cadenceD2(at, eye, lens)` and `lensOf(proj)`."
  - "Cadence stagger sums `this._frame` with per-body phase rather than per-body tick counters; returning, far, or frozen-frame bodies reset `posed = false` (and skin-required bodies take rank `3`) so their next visible frame poses immediately."
  - "Skipped pose frames accumulate `dt` up to `EFFECTS_BANK_MAX_S = 0.1` for `stepRigEffects`, while `SKIN_BUDGET = 4` caps bodies skinned per frame via `bySkinRank` (`rank` desc, `posedAt` asc, `d2` asc)."
  - "Frustum culling (`viewPlanes`/`sphereInView`) uses `BODY_SPHERE_SHARE = 0.75` plus `turnLeadMargin` (`CULL_MARGIN_M = 2`, `TURN_LEAD_MAX = 1.2`, `TURN_LEAD_FRAMES = 3`), and `BODIES_MAX = 8` bounds active rigs (`SWAP_DWELL_MS = 2500`, `SWAP_EVERY_MS = 4000`, `SPARE_MAX = 4` for `SPARE_MS = 60000` keyed by `peerBodyKey`)."
traps:
  - "Keying cadence stagger on per-body tick counters aligns crowd updates onto the same frame and causes frame spikes."
  - "`peerBodyKey` excludes held weapons (`setWeapon` swaps weapons without rebuilding; `BODY_REBUILD_MS = 10000` throttles look rebuilds), and third-person meshes pass `bounds: false`."
dfu: []
tags:
  - peer-bodies
  - pose-cadence
  - skin-budget
  - frustum-culling
  - crowd
---

# Peer Body Pose Cadence, Skin Budget, Culling, and Spare Rigs

`PeerBodies` and `PeerBodies._place` (`src/net/peerBodies.js`) decouple 3D peer rig rendering from the `POSE_HZ = 10` wire rate (`src/net/online.js`) using distance-tiered pose cadence, skin budgets, frustum culling, and spare rig pooling.

- **Distance cadence and skin budget (`peerBodies.js`):** `POSE_CADENCE = [[10, 1], [25, 2], [Infinity, 3]]` poses bodies every frame within `10` m, every second frame within `25` m, and every third frame beyond `25` m via `cadenceD2(at, eye, lens)` and `lensOf(proj)`. Stagger adds `this._frame` to per-body phase rather than per-body tick counters. Returning, far, or frozen-frame bodies reset `posed = false` (and skin-required bodies take rank `3`) to pose immediately upon re-entry. Skipped frames bank `dt` up to `EFFECTS_BANK_MAX_S = 0.1` for `stepRigEffects`, while `SKIN_BUDGET = 4` caps per-frame skinning via `bySkinRank` (`rank` desc, `posedAt` asc, `d2` asc).
- **Frustum culling, spares, and weapons (`peerBodies.js`, `fpArm.js`, `renderer.js`):** `viewPlanes` and `sphereInView` cull by `BODY_SPHERE_SHARE = 0.75` plus `turnLeadMargin` (`CULL_MARGIN_M = 2`, `TURN_LEAD_MAX = 1.2`, `TURN_LEAD_FRAMES = 3`). `BODIES_MAX = 8` caps active rigs (`SWAP_DWELL_MS = 2500`, `SWAP_EVERY_MS = 4000`, `SPARE_MAX = 4` for `SPARE_MS = 60000` keyed by `peerBodyKey`). `peerBodyKey` omits weapons (`setWeapon` swaps without rebuilding, `BODY_REBUILD_MS = 10000` throttles look rebuilds, and `peerWeaponOf` caches `_stubSlots` in a `WeakMap`), while third-person meshes pass `bounds: false`.
