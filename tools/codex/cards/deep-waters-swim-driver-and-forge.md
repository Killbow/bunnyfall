---
slug: "deep-waters-swim-driver-and-forge"
title: "Deep Waters Swim Driver, Forged Water Line, and Stroke"
domain: "world"
kind: "subcard"
parent: "deep-waters-overview"
files:
  - "src/world/deepWaterSwim.js"
  - "src/underwater/deepWatersPlayer.js"
  - "src/underwater/deepWatersSwimMove.js"
  - "src/underwater/deepWaterPlayer.js"
  - "src/world/deepWaterRuntime.js"
  - "src/scenes/frame/motorFrame.js"
  - "src/player/motor.js"
  - "src/render/underwaterFog.js"
routes: []
tables: []
replacesBible:
  - "03-World/Deep-Waters.md"
related:
  - "deep-waters-overview"
  - "deep-waters-enemies-and-sunken-loot"
invariants:
  - "In water: swimCheckY (center + 1.25 - 0.95) is within SWIM_EXIT_CLEARANCE 0.75 m of the sea (DESCEND_WATER_CONTACT_ALLOWANCE 1.5 while diving) over a usable column, with WATER_CONTACT_GRACE_SECONDS 1.25."
  - "Swimming hysteresis: SWIM_ENTER_CLEARANCE 0.1 m, or 0.75 m once forged, or while diving or rising."
  - "Presentation underwater: camera below sea + 0.04 or head under. It clears once the camera is 0.08 m clear."
  - "The forge hands DFU blockWaterLevel via worldYToBlockWaterLevel (-y / 0.025, clamped to a short). The host writes the motor flags once per frame (applyMotorEffectFlags), because every change of LevitateMotor.IsSwimming cancels a step."
  - "Ascent ceiling: sea + 0.55 - 1.25 + 0.93 (surfaceAscentCeiling)."
  - "Load grace: LOAD_GRACE_SECONDS 1.5 after load or teleport, and LOCATION_LOAD_STUCK_SECONDS 12. It suppresses the stroke, the multiplier and the shore exit."
traps:
  - "The port never raises isPlayerInsideDungeon during the forge. Doing so would reach the city watch, ambient light, quest placement and saves."
  - "OCEAN-STUCK: a swimmer whose carried weight x 4 > OVER_ENCUMBERED_LIMIT (250, i.e. 62.5 kg) is dragged down by LevitateMotor. That swimmer must still be able to take the shore exit from below."
  - "Forged `OnExteriorWater` makes the DFU height changer swim-crouch the player without sinking them, and `KeepSurfaceCameraUnsunk` undoes vanilla sinks."
dfu: []
tags:
  - "deep-waters"
  - "swimming"
  - "motor"
  - "stroke"
  - "fatigue"
---

# Deep Waters Swim Driver, Forged Water Line, and Stroke

Exterior swimming, forged water-level handoffs, swim strokes, and shore exits run across `src/world/deepWaterSwim.js`, `src/world/deepWaterRuntime.js`, `src/underwater/deepWatersPlayer.js`, `src/underwater/deepWatersSwimMove.js`, `src/underwater/deepWaterPlayer.js`, `src/scenes/frame/motorFrame.js`, `src/player/motor.js`, and `src/render/underwaterFog.js`.

- **Water detection, hysteresis, and forged motor flags:** A player is in water when `swimCheckY` (`center + 1.25 - 0.95`) sits within `SWIM_EXIT_CLEARANCE` (`0.75` m, or `DESCEND_WATER_CONTACT_ALLOWANCE` `1.5` m while diving) of a usable sea column with `WATER_CONTACT_GRACE_SECONDS` (`1.25` s). Swimming engages at `SWIM_ENTER_CLEARANCE` (`0.1` m, or `0.75` m once forged, diving, or rising) up to `surfaceAscentCeiling` (`sea + 0.55 - 1.25 + 0.93`). Underwater presentation (`src/render/underwaterFog.js` and `1000` Hz audio low-pass, with clip `346` splashes at volume `0.7` every `2.5` m) activates below `sea + 0.04` or head submersion and clears at `0.08` m above sea. The forge converts depth via `worldYToBlockWaterLevel` (`-y / 0.025`, clamped to a short) and writes `applyMotorEffectFlags` once per frame without raising `isPlayerInsideDungeon`; forged `OnExteriorWater` and `KeepSurfaceCameraUnsunk` prevent camera sinking.
- **Stroke, shore exit, and load grace:** Swim speed uses `AddWalkSpeedMod` (after phase order `32000`), while `STROKE` (`duration: 0.48`, `cooldown: 0.9`, `extraSpeed: 2.65`, `fatigue: max(24, ceil(MaxFatigue * 0.025))`, `seafloorClearance: 0.18`) scales by tempo. `SHORE_EXIT` probes from `sea + 13` m down `18` m for a landing `1` m ahead (lifting the capsule `1.5` m above it), rescuing `OCEAN-STUCK` swimmers when carried weight times `4` exceeds `OVER_ENCUMBERED_LIMIT` (`250`, or `62.5` kg). `LOAD_GRACE_SECONDS` (`1.5` s) and `LOCATION_LOAD_STUCK_SECONDS` (`12` s) suppress stroke, multiplier, and shore exit after loads or teleports.
