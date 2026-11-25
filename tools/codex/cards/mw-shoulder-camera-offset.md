---
slug: mw-shoulder-camera-offset
title: "Morrowind Shoulder Camera Offset and Obstacle Sweep"
domain: player
kind: subcard
parent: third-person-trunk-clearance-and-bow-aim-overview
files:
  - src/player/mwCamera.js
  - src/player/mwView.js
  - src/mods/features.js
  - src/ui/settingsMap.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26c.md"
related:
  - third-person-trunk-clearance-and-bow-aim-overview
  - travel-view-camera-and-ground-pick
invariants:
  - "Feature 'mw-shoulder-camera': Off (default, centered), Right, Left."
  - "SHOULDER_OFFSET = [30, -10] mirrored for left; COMBAT_OFFSET = [0, 15] when weapon/spell readied or swimming."
  - "mwViewFrame integrates the offset once per frame."
traps:
  - "zoomOutWhenMoveCoef (20) and autoSwitchShoulder are intentionally not ported."
  - "Collision sweeps a sphere from the actor line to the offset focal point (FOCAL_OBSTACLE_LIMIT = 10)."
dfu: []
tags:
  - camera
  - third-person
  - shoulder
  - feature-flag
---

# Morrowind Shoulder Camera Offset and Obstacle Sweep

The third-person Morrowind view supports an optional over-the-shoulder focal offset with combat stance shifts and sphere-swept wall clamping (`src/player/mwCamera.js`, `src/player/mwView.js`, `src/mods/features.js`, `src/ui/settingsMap.js`).

- **Feature Modes and Focal Offsets (`src/player/mwCamera.js`, `src/mods/features.js`, `src/ui/settingsMap.js`):** The `'mw-shoulder-camera'` feature setting offers three choices: `Off` (the centered default), `Right`, and `Left`. When active, the camera shifts its focal point by `SHOULDER_OFFSET` (`[30, -10]` on the right, mirrored horizontally on the left) and adds `COMBAT_OFFSET` (`[0, 15]`) whenever the player readies a weapon or spell or enters swimming mode. Unlike OpenMW, `zoomOutWhenMoveCoef` (`20`) and `autoSwitchShoulder` are intentionally omitted so the camera neither zooms on movement nor flips sides against walls.
- **Per-Frame Smoothing and Obstacle Sweep (`src/player/mwCamera.js`, `src/player/mwView.js`):** `mwViewFrame` integrates the focal offset once per frame at `dt * (1 + 5 / |delta|) * speed`, using `speed = 5` across combat state transitions and `speed = 1` otherwise. To prevent the displaced focal target from clipping through geometry, collision detection sweeps a sphere from the actor centerline out to the offset focal point and clamps against obstacles within `FOCAL_OBSTACLE_LIMIT` (`10`).
