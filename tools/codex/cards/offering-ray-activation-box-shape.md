---
slug: offering-ray-activation-box-shape
title: "Street Activation RayBox Contract and Hover Fault Containment"
domain: systems
kind: overview
parent: null
files:
  - src/scenes/worldModes.js
  - src/player/activate.js
  - src/homes/witchesHost.js
  - src/render/frustum.js
  - src/scenes/world.js
  - src/ui/worldPlaque.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20e.md"
related:
  - witches-festival-hearth-offerings
  - social-plaque-sight-ray-and-hand-door
  - gather-hover-lock-and-automap-layout-keep
invariants:
  - "Every target pushed into `exteriorActivationTargets().targets` (`src/scenes/worldModes.js`) must carry `aabb` as a `RayBox` object `{ min: number[], max: number[] }` (`RayTarget` in `src/player/activate.js`)."
  - "`rayAabb` reads `aabb.min[a]` and `aabb.max[a]` directly; callers holding 6-element `flatBatchAabb` culling arrays (`src/homes/witchesHost.js`, `src/scenes/world.js` boards and graves) must translate corners into `{ min, max }` before target registration."
  - "`exteriorHoverPick` and `exteriorActivationHit` share `exteriorActivationTargets`, with hover wrapped inside `worldHoverFrame` (`src/ui/worldPlaque.js`) fault containment while street press actions run unguarded."
traps:
  - "Because `pickActivatableHit` slab-tests every registered entrant before comparing hit distances, a single raw 6-array `aabb` throws `Cannot read properties of undefined` on every street press regardless of crosshair aim."
  - "A silent World Tooltips plaque stand-down after one console warning can mask a malformed `aabb` that crashes all street door and NPC presses."
dfu: []
tags:
  - activation
  - raycast
  - witches-festival
  - exterior
  - plaque
---

# Street Activation RayBox Contract and Hover Fault Containment

Exterior interaction rays (`src/scenes/worldModes.js`, `src/player/activate.js`, `src/homes/witchesHost.js`, `src/render/frustum.js`, `src/scenes/world.js`, and `src/ui/worldPlaque.js`) require every street target to supply a `{ min, max }` bounding box.

## RayBox Shape and Corner Translation

- **Target Contract**: Every entrant pushed into `exteriorActivationTargets().targets` (`src/scenes/worldModes.js`) must carry `aabb` as a `RayBox` object `{ min: number[], max: number[] }` matching `RayTarget` in `src/player/activate.js`.
- **Corner Translation**: `rayAabb` reads `aabb.min[a]` and `aabb.max[a]` directly. Callers holding 6-element `flatBatchAabb` culling arrays (`src/homes/witchesHost.js` and `src/scenes/world.js` boards and graves) must translate corners into `{ min, max }` before registration.
- **Type Checking**: `src/homes/witchesHost.js` types `_targets` as `RayTarget[]` under `// @ts-check` alongside `RAY_DISTANCE` and `DEFAULT_ACTIVATION_DISTANCE`.

## Shared Target List and Fault Containment

`exteriorHoverPick` and `exteriorActivationHit` share `exteriorActivationTargets`. Because `pickActivatableHit` slab-tests every registered target before comparing distances, one raw 6-array `aabb` throws `Cannot read properties of undefined` on every street press regardless of aim. Hover runs inside `worldHoverFrame` (`src/ui/worldPlaque.js`) fault containment and stands down after one warning, whereas unguarded street door and NPC presses crash.
