---
slug: hung-shop-signs-body-pass-and-fence-rail-headroom
title: "Hung Shop Sign Body Pass-Through and Split-Rail Fence Headroom"
domain: world
kind: subcard
parent: reforge-kept-names-road-sparing-and-crown-glints-overview
files:
  - src/world/signSolid.js
  - src/world/houseSigns.js
  - src/player/collider.js
  - src/player/lateSolid.js
  - src/player/motor.js
  - src/world/pixelBuild.js
  - src/scenes/exterior.js
  - src/world/merchantYards/merchantYardModels.js
  - src/characters/enemyMotor.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25i.md"
related:
  - reforge-kept-names-road-sparing-and-crown-glints-overview
  - snowless-climates-yards-and-house-signs-overview
  - physical-items-body-physics-and-shift-drop
invariants:
  - "On town shop sign models (`ARCH3D` `43700` to `43755`, `isShopSignModel` in `src/world/signSolid.js`), triangles whose vertices all sit at least `SIGN_HANG_M` (`1` m) above the model base let `BODY_RAY` (`{ bodies: true }`) capsule checks (`RIDE_HEIGHT = 2.6` m) pass underneath while still blocking sight, missiles, clicks, and camera sweeps."
  - "Split-rail fence rails (`41206` to `41208`) count as floors only when `_standsOn` (`src/player/collider.js`) confirms standing headroom across three upward `BODY_RAY` casts; otherwise they resolve as walls."
  - "Walking step height evaluates `dy === 0 || _onGround`, `EnemyMotor` walks start grounded (`src/characters/enemyMotor.js`), and closed solids without headroom resolve from inside as walls (`insideSolid`)."
traps:
  - "The camera clips the lowest ~5 cm of 1.65 m hung boards for 3-4 frames when walking directly under them."
  - "Never filter sign triangles out of non-body raycasts; enemy sight and missiles must still hit them."
dfu:
  - Assets/Scripts/Utility/AssetInjection/MeshReplacement.cs
tags:
  - collision
  - shop-signs
  - fences
  - capsule
  - enemy-motor
---

# Hung Shop Sign Body Pass-Through and Split-Rail Fence Headroom

Town shop signs (`src/world/signSolid.js`, `src/world/houseSigns.js`) and split-rail fences (`src/player/collider.js`, `src/world/merchantYards/merchantYardModels.js`) split capsule body collision from sight and interaction raycasts so mounted riders and pedestrians do not snag on overhanging boards or low rail wedges.

## Hung Shop Sign Body Filtering

Unlike DFU combined block colliders (`Assets/Scripts/Utility/AssetInjection/MeshReplacement.cs`), `src/world/signSolid.js` tags town shop sign models (`ARCH3D` `43700` to `43755` via `isShopSignModel`, wired through `src/world/houseSigns.js`, `src/player/lateSolid.js`, `src/world/pixelBuild.js`, and `src/scenes/exterior.js`). Any triangle whose vertices all sit at least `SIGN_HANG_M` (`1` m) above the model base is ignored by `BODY_RAY` (`{ bodies: true }`) capsule sweeps (`src/player/motor.js`), allowing mounted riders (`RIDE_HEIGHT = 2.6` m) to pass under 1.65 m hung boards while posts and ground frames stay solid. Non-body raycasts keep hitting those triangles so enemy sightlines, missiles, sign clicks, and camera sweeps remain blocked.

## Split-Rail Fence Headroom and Grounded Stepping

- **Rail headroom checks (`src/player/collider.js`):** Split-rail fence models (`41206` to `41208`, whose rail wedges carry a back edge 0.55 m up) qualify as walkable floor polygons only when `_standsOn` confirms full standing headroom across three upward `BODY_RAY` casts; rails lacking upper clearance resolve as walls.
- **Step height and enclosed solids (`src/player/collider.js`, `src/characters/enemyMotor.js`):** Step-up checks evaluate `dy === 0 || _onGround`, `EnemyMotor` movement starts grounded, and penetrations inside closed meshes without headroom push outward as walls (`insideSolid`).
