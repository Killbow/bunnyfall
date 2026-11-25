---
slug: travel-options-steering-feelers-and-budgets
title: "Travel Steering Feelers, Detours, and Stop Budgets"
domain: world
kind: subcard
parent: travel-options-journey-overview
files:
  - src/travel/travelSteer.js
  - src/travel/travelAutopilot.js
  - src/player/motor.js
  - src/world/terrainLodWorld.js
  - src/scenes/frame/motorFrame.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Travel-Options.md"
related:
  - travel-options-journey-overview
  - travel-view-routing-and-load-governor
  - travel-view-roaming-bands-and-threat
invariants:
  - "`TRAVEL_STEER` (`src/travel/travelSteer.js`) has `body: 0.45` (corridor `0.9`), `standoff: 1.0`, `pursuit: 8`, `onLine: 0.25`, `detourBudget: 200`, `headwayBudget: 400`, `jumpMin: 64`, `jumpReaches: 4`, and `maxFeelers: 16`."
  - "Feelers run at `FEELER_HEIGHT = STEP_OFFSET + 0.1` in `FEELER_LEG = 8` m legs through the motor collider (`createColliderProbe`). They ride up to `FEELER_RIDES = 4` walkable faces per leg (`TRAVEL-NAV2`)."
  - "`travelFrameReach` bounds a frame as `speed * min(dt, MAX_FRAME_DT) * scale` plus one fixed step. `MAX_FRAME_DT = 0.25` (`src/player/motor.js`) is applied before scaling."
  - "Steering runs only when `settings.avoidObstacles` is on and the traveller is not at sea. A `'stuck'` or `'blocked'` stop shows `MsgStuck`/`MsgBlocked` and interrupts."
traps:
  - "A position jump above `jumpMin` and `jumpReaches` times the frame reach (ship boarding, teleport) re-seats the line without spending the detour or headway budget."
  - "`TRAVEL-STRAFE`: held `A`/`D` suspends detours, re-aligns the line from the sidestep, and exempts the move from the headway/grind windows. The full corridor is still cast while strafing."
  - "`travelDriveForward` holds forward force when `travelLookaheadFor` (`floor: 64`, `margin: 1.5`) finds unbuilt ground ahead, so the body cannot fall through unstreamed terrain."
dfu: []
tags:
  - travel-options
  - steering
  - collider
  - detour
  - streaming
---

`src/travel/travelSteer.js` and `src/travel/travelAutopilot.js` steer overland journeys around obstacles while enforcing detour, headway, grind, and streaming lookahead guards.

## Feelers, Fan Geometry, and Detour Line

Steering runs when `settings.avoidObstacles` is on and the player is ashore. `TRAVEL_STEER` sets `body: 0.45` (corridor `0.9`), `standoff: 1.0`, `pursuit: 8`, `onLine: 0.25`, and `maxFeelers: 16`. Probes cast via the motor collider (`createColliderProbe`) at `FEELER_HEIGHT = STEP_OFFSET+0.1` in `FEELER_LEG` (`8` m) legs, riding up to `FEELER_RIDES` (`4`) walkable faces per leg (`TRAVEL-NAV2`).

When blocked, the fan tests `[5,10,20,30,45,60,75,90,105,120,150,180]` degrees (`sideSpan: 5`) and holds a side for `commitMetres` (`40` m). A detour ends only past its start along the line so it cannot cycle behind obstacles.

## Budgets, Strafe, and Lookahead Hold

`travelFrameReach` bounds a frame to `speed*min(dt, MAX_FRAME_DT)*scale` plus one fixed step, clamping `dt` to `MAX_FRAME_DT` (`0.25` in `src/player/motor.js`) before scaling. Exhausting `detourBudget` (`200`), `headwayBudget` (`400`), or the grind check (`grindWindow: 6`, `grindSteps: 3`, `grindRatio: 0.25`, `grindWindows: 3`) stops with `'blocked'` or `'stuck'`, showing `MsgBlocked` or `MsgStuck`.

Jumps above `jumpMin` (`64`) and `jumpReaches` (`4`) times the frame reach (ship boarding, teleports) re-seat the line without spending budgets. Held `A`/`D` (`TRAVEL-STRAFE`) suspends detours, re-anchors the line, and pauses headway/grind checks while still casting the corridor. In `src/scenes/frame/motorFrame.js` and `src/world/terrainLodWorld.js`, `travelDriveForward` holds forward force when `travelLookaheadFor({ floor: 64, margin: 1.5 })` finds unbuilt terrain ahead.
