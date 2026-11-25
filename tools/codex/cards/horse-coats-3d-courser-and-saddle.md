---
slug: horse-coats-3d-courser-and-saddle
title: "Horse Coats: 3D Courser Bake, Gaits, Texel Dye, and Saddle Pose"
domain: rendering
kind: subcard
parent: horse-coats-overview
files:
  - tools/bakeHorse.mjs
  - src/assets/horse/courser.json
  - src/world/horseModel.js
  - src/world/horseRig.js
  - src/player/seatPose.js
  - src/player/mwView.js
  - src/player/motor.js
  - src/world/standingHorses.js
  - src/render/renderer.js
  - src/render/characterSprite.js
  - src/net/onlineWorld.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Coats.md"
related:
  - horse-coats-overview
  - horse-coats-sprite-dye-and-hide-mask
  - horse-care-breath-gallop-and-walk
  - horse-teams-pose-cadence-and-dye-budget
invariants:
  - "courser.json: 33 parent-first bones, gaits idle/walk/trot/gallop at 0 / 0.668 / 1.932 / 10.3088 m/s."
  - "HORSE_GAIT_FROM walk 0.2, trot 1.3, gallop 5 m/s; GAIT_HOLD = 0.15 hysteresis; GAIT_FADE = 0.25 s."
  - "HORSE3D_LOOKS_KEPT = 12, DYE_ROWS = 32 per frame, LOOK_ASK_STALE = 30 frames."
  - "HORSE_SEAT = [0, 0.1, 1.68]; STIRRUP_SIDE = 0.32, STIRRUP_DROP = 0.8; SINK_SLACK = 0.15."
traps:
  - "gaitFor with gallops=false (motor.js slowRide) caps a ridden horse at trot (HORSE-WALK)."
  - "HORSE-POV: mwViewHides hides the 2D riding sprite whenever the Morrowind view is third person."
  - "Bake normalizes skin weights summing 0.07-2.0; an unnormalized blend collapses or doubles vertices."
dfu: []
tags:
  - horses
  - 3d
  - gaits
  - saddle
  - texel-dye
---

# Horse Coats: 3D Courser Bake, Gaits, Texel Dye, and Saddle Pose

The 3D horse pipeline bakes `src/assets/horse/courser.json` via `tools/bakeHorse.mjs` and animates rigged mounts, town idlers, and seated riders across `src/world/horseModel.js`, `src/world/horseRig.js`, and `src/player/seatPose.js`.

## Courser Rig, Gaits, and Texel Dyeing

- **Bake and gaits (`tools/bakeHorse.mjs`, `src/world/horseRig.js`):** `courser.json` packs 33 parent-first bones, normalizing vertex skin weights whose sums fall in `0.07-2.0` so blends never collapse or double vertices, alongside `idle`, `walk`, `trot`, and `gallop` clips at `0`, `0.668`, `1.932`, and `10.3088` m/s. `HORSE_GAIT_FROM` switches to walk at `0.2`, trot at `1.3`, and gallop at `5` m/s with `GAIT_HOLD = 0.15` hysteresis and `GAIT_FADE = 0.25` s crossfades. Passing `gallops = false` to `gaitFor` (`slowRide` in `src/player/motor.js`) caps the mount at trot.
- **3D texel dye (`src/world/horseModel.js`):** `dyeHorseTexelRows` and `texelPlanes` project coat markings across six axis planes blended with `PLANE_SHARPNESS = 4` and `WHITE_FLOOR_3D = 0.4`. The cache holds `HORSE3D_LOOKS_KEPT = 12` textures, dyeing `DYE_ROWS = 32` rows per frame and expiring unasked requests after `LOOK_ASK_STALE = 30` frames.

## Saddle Pose, Town Idlers, and Visibility

`src/player/seatPose.js` anchors the rider at `HORSE_SEAT = [0, 0.1, 1.68]` with `STIRRUP_SIDE = 0.32`, `STIRRUP_DROP = 0.8`, and `SINK_SLACK = 0.15`, while `mwViewHides` (`src/player/mwView.js`) hides the 2D riding sprite in third-person view. `src/world/standingHorses.js` replaces up to `STANDING_HORSES_MAX = 8` `TEXTURE.201` town horses within `STANDING_HORSE_RANGE = 60` m with 3D stranger-look idlers. Each horse allocates its own `renderer.createSkinPalette` (`src/render/renderer.js`), and mounts of concealed owners render translucent after the opaque pass via `drawVeiled3d`.
