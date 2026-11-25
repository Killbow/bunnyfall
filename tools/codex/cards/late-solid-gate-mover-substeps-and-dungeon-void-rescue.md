---
slug: "late-solid-gate-mover-substeps-and-dungeon-void-rescue"
title: "Late-Solid Clearance Gate, Mover Sub-Steps, and Dungeon Void Rescue"
domain: "world"
kind: "subcard"
parent: "enchantment-side-once-duel-vitality-and-questor-notices-overview"
files:
  - "src/player/lateSolid.js"
  - "src/player/collider.js"
  - "src/homes/decorRoom.js"
  - "src/homes/decorBase.js"
  - "src/world/pixelBuild.js"
  - "src/player/moverBody.js"
  - "src/world/actionSystem.js"
  - "src/player/enterExit.js"
  - "src/scenes/dungeonContext.js"
  - "src/scenes/worldModes.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19f.md"
related:
  - "enchantment-side-once-duel-vitality-and-questor-notices-overview"
  - "landforms-save-frame-and-restand"
  - "body-motion-overview"
invariants:
  - "Every solid a late build files (home decor, yard decor, pixelBuild rocks/mountains/camps/ruins/town models) passes the collider's lateSolidsOf gate and is withheld until lateSolidCloses says the body is clear."
  - "A mover is stepped in at most MOVER_STEPS_MAX = 16 sub-steps (MOVER_STEP = CAPSULE_RADIUS / 2); if a body would be pinned, the mover holds at its last clear pose."
  - "A body more than INTERIOR_VOID_DROP = 10 m below the lowest dungeon triangle is stood again at the dungeon's spawn and told why."
traps:
  - "Pixel solids live under the pixel's own bucket key and leave via Collider.removeBucket; filing one outside lateSolidsOf reintroduces ROCK-CLEAR."
  - "MOVER_PRESS = 1e-3 is the overlap tolerance for moverPresses; do not widen it to hide pinning."
dfu:
  - "Assets/Scripts/Game/Player/PlayerGroundMotor.cs"
tags:
  - "collision"
  - "movers"
  - "decor"
  - "landforms"
  - "dungeon"
  - "failsafe"
---

# Late-Solid Clearance Gate, Mover Sub-Steps, and Dungeon Void Rescue

Late-streamed solid collision gating, sub-stepped action movers, and interior void rescue prevent players from getting trapped or falling below dungeon geometry across `src/player/lateSolid.js`, `src/player/moverBody.js`, and `src/scenes/dungeonContext.js`.

- **Late-solid clearance gate:** Every solid registered by late builds, including home and yard decor (`src/homes/decorRoom.js` with `DECOR_LIST_RETRY_MS = 2000`, `src/homes/decorBase.js`) and streamed overworld geometry (`src/world/pixelBuild.js` rocks, mountains, camps, ruins, and town models), routes through `lateSolidsOf` on `src/player/collider.js`. The gate withholds collision registration until `lateSolidCloses` (`src/player/lateSolid.js`) confirms the player capsule is clear. Overworld pixel solids are keyed by pixel bucket and removed via `Collider.removeBucket`; bypassing `lateSolidsOf` reintroduces rock-trapping bugs.
- **Mover sub-steps and anti-pinning:** In `src/world/actionSystem.js`, `_standMover` advances moving platforms and doors through `moverSteps` and `meetBody` (`src/player/moverBody.js`) in at most `MOVER_STEPS_MAX = 16` increments of `MOVER_STEP = CAPSULE_RADIUS / 2`. `carriedBy` translates a riding body alongside the platform, while `moverPresses` checks overlap against `MOVER_PRESS = 1e-3` and halts the mover at its last clear pose if motion would pin the body.
- **Dungeon void rescue:** `src/scenes/dungeonContext.js` constructs `voidRescue` via `dungeonVoidRescue` (`src/player/enterExit.js`). When a player drops more than `INTERIOR_VOID_DROP = 10` meters below the lowest dungeon triangle, `src/scenes/worldModes.js` invokes `standFromVoid` to return the body to the dungeon spawn and displays `dungeonVoidText`.
