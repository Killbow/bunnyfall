---
slug: boat-shape-stamps-horse-cadence-and-grass-pacing
title: "Prefab Tree Shape Stamps, Horse View Cadence, and Grass Frame Pacing"
domain: rendering
kind: subcard
parent: enemy-frames-first-hold-and-owner-clock-overview
files:
  - src/world/prefabNode.js
  - src/systems/naval/farLife.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/comeSailAwayPool.js
  - src/systems/naval/comeSailAwayPeers.js
  - src/world/horseView.js
  - src/render/labGrass.js
  - tools/grassMoveProbe.mjs
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-21c.md"
related:
  - enemy-frames-first-hold-and-owner-clock-overview
  - performance-priority-overview
  - horse-teams-pose-cadence-and-dye-budget
  - come-sail-away-online-peer-boats-and-aboard
invariants:
  - "Every prefab hierarchy tracks `_treeStamp` on its root node (`prefabShapeStamp(node)` in `src/world/prefabNode.js`, with `setParent` rejecting cycles), letting `createBoatLives` and `farTreeStep` (`src/systems/naval/farLife.js`) reuse cached walks on distant hulls."
  - "Horse pose evaluation and palette uploads (`src/world/horseView.js`) gate on camera frustum visibility and distance cadence (`horsePoseDue`, `poseWhereSeen`)."
  - "Grass generation (`src/render/labGrass.js`) schedules cells by travel time to `GRASS_DUE_AT = 0.9` of range, spending rim-cell budget first and granting immediate cells `GRASS_FRAME_MS = 3` ms above base pace."
traps:
  - "Toggling visibility or attachment on any node inside a boat prefab tree must bump `_treeStamp` so cached transforms invalidate."
  - "Jungle biomes run two grass fields that each claim their own frame slice."
dfu: []
tags:
  - prefab
  - boats
  - horses
  - grass
  - performance
---

# Prefab Tree Shape Stamps, Horse View Cadence, and Grass Frame Pacing

Client frame pacing (`src/world/prefabNode.js`, `src/systems/naval/farLife.js`, `src/world/horseView.js`, and `src/render/labGrass.js`) caches distant boat hierarchy walks, throttles horse pose updates, and schedules grass cells by travel time.

## Boat Prefab Tree Stamps and Horse Pose Cadence

- **Prefab Shape Stamps**: Every prefab hierarchy tracks `_treeStamp` on its root via `prefabShapeStamp(node)` (`src/world/prefabNode.js`, where `setParent` rejects parent cycles). `createBoatLives` and `farTreeStep` (`src/systems/naval/farLife.js`, alongside `src/systems/naval/comeSailAway.js`, `src/systems/naval/comeSailAwayPool.js`, and `src/systems/naval/comeSailAwayPeers.js`) reuse cached hierarchy walks on distant hulls until a visibility or attachment change bumps `_treeStamp`.
- **Horse View Cadence**: In `src/world/horseView.js`, `horsePoseDue` and `poseWhereSeen` gate horse pose evaluation and palette uploads on camera frustum visibility and distance cadence.

## Grass Travel-Time Scheduling

`src/render/labGrass.js` schedules cell generation by travel time to `GRASS_DUE_AT = 0.9` of range, spending rim-cell budget first and granting immediate cells `GRASS_FRAME_MS = 3` ms above base pace. Jungle biomes run two grass fields that each claim their own frame slice. `tools/grassMoveProbe.mjs` benchmarks grass streaming across walk, run, ride, gallop, and cart speeds.
