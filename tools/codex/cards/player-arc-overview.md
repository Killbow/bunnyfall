---
slug: "player-arc-overview"
title: "Player Arc: First-Person Body, Motor, and Fixed Timestep"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/player/motor.js"
  - "src/player/collider.js"
  - "src/player/activate.js"
  - "src/player/enterExit.js"
  - "src/player/pointerLock.js"
  - "src/scenes/worldModes.js"
  - "src/characters/enemyMotor.js"
  - "scripts/buildTag.mjs"
  - "src/buildTag.js"
routes: []
tables: []
replacesBible:
  - "03-World/Player-Arc.md"
related:
  - "player-arc-motor-speeds-crouch-swim-and-breath"
  - "player-arc-capsule-collision-and-prop-bodies"
  - "player-arc-activation-doors-and-transitions"
  - "world-modes-and-transitions"
  - "late-solid-gate-mover-substeps-and-dungeon-void-rescue"
  - "body-motion-overview"
invariants:
  - "The player motor advances on a FIXED_DT = 1/60 accumulator, and each frame's real dt is clamped to MAX_FRAME_DT = 0.25."
  - "Enemy AI steps on the same `FIXED_DT` (`1/60`) but clamps frame delta with `FOE_MAX_FRAME_DT = 3 * FIXED_DT`, not `MAX_FRAME_DT`."
  - "Body dimensions have one source: CAPSULE_HEIGHT = 1.8, CAPSULE_RADIUS = 0.35, STEP_OFFSET = 0.5, EYE_HEIGHT = 1.7, all exported from src/player/motor.js."
traps:
  - "Pointer lock must go through requestLook (src/player/pointerLock.js). Calling canvas.requestPointerLock directly brings back the P9 silent look failures."
  - "The postbuild script runs git checkout -- src/buildTag.js. Never hand-commit a stamped build tag."
dfu:
  - "Assets/Scripts/Game/PlayerMotor.cs"
  - "Assets/Scripts/Game/Player/PlayerSpeedChanger.cs"
  - "Assets/Scripts/Game/Player/AcrobatMotor.cs"
  - "Assets/Scripts/Game/EnemyMotor.cs"
tags:
  - "player"
  - "motor"
  - "collision"
  - "fixed-timestep"
  - "first-person"
---

# Player Arc: First-Person Body, Motor, and Fixed Timestep

The player arc ports the Daggerfall Unity first-person body across grounded capsule movement (`src/player/motor.js`), triangle collision (`src/player/collider.js`), ray activation (`src/player/activate.js`), and building, dungeon, and world transitions (`src/player/enterExit.js` and `src/scenes/worldModes.js`).

- **Fixed timestep and enemy stepping:** The player motor advances on a `FIXED_DT = 1/60` accumulator while clamping real frame delta to `MAX_FRAME_DT = 0.25`. Enemy AI (`src/characters/enemyMotor.js`) shares `FIXED_DT = 1/60` but clamps frame delta with `FOE_MAX_FRAME_DT = 3 * FIXED_DT`. `SYSTEM_TIMER_UPDATES_DIVISOR = 0.0549254` converts classic system-timer units into seconds for climbing and breath cadences.
- **Canonical body dimensions and gravity:** `src/player/motor.js` is the single export source for `CAPSULE_HEIGHT = 1.8`, `CAPSULE_RADIUS = 0.35`, `STEP_OFFSET = 0.5`, and `EYE_HEIGHT = 1.7`, alongside `GRAVITY = 20`, `JUMP_SPEED = 4.5`, `SLOPE_LIMIT_DEG = 70`, `FALL_DAMAGE_THRESHOLD = 5` with `FALL_HP_PER_METRE = 5`, and `SLOWFALL_SPEED = 105`.
- **Pointer lock, debug probe, and build tag:** All pointer-lock requests route through `requestLook` (`src/player/pointerLock.js`) rather than direct `canvas.requestPointerLock` calls. The `window.__player` debug probe is assigned exclusively in `src/characters/playerEntity.js`, and `npm prebuild` runs `scripts/buildTag.mjs` to stamp `src/buildTag.js` before `postbuild` restores it via `git checkout -- src/buildTag.js`.
