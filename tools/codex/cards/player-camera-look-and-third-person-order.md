---
slug: "player-camera-look-and-third-person-order"
title: "Mouse Look, Move Axes, and Third-Person Camera Order"
domain: "player"
kind: "subcard"
parent: "player-arc-overview"
files:
  - "src/player/eotbCamera.js"
  - "src/player/eotbBillboard.js"
  - "src/player/lookFilter.js"
  - "src/player/moveAxes.js"
routes: []
tables: []
replacesBible: []
related:
  - "player-arc-overview"
  - "layered-gearing-overview"
  - "controls-keybinding-registry-overview"
invariants:
  - "`posOffset` tests the Boat, Mount, and Weapon overrides in that order and returns on the first match, so a mounted player with a weapon readied takes the Mount offsets."
  - "The wheel moves the third-person distance one increment per frame by sign only, as the mod reads its axis once per update. Several notches inside one frame must move the camera as far as one."
traps:
  - "The automatic shoulder switch runs inside `checkBounds` between the X and Y casts, and `revertMirror` runs before `checkBounds`. Reordering these changes camera behavior, because the switch flips `mirror` in place."
  - "The camera's start step runs once per boot through the `started` latch. Each host builds a new rig, so without the latch every building or dungeon entry would reset the player's third-person state."
  - "`orientationFor` measures `signedAngleY(toCamera, facing)` in that argument order. Swapping the two negates the angle and runs the orientation wheel backward, so a turning player is drawn from the wrong side."
  - "With acceleration on, the autorun force is applied before the key forces, and it raises the positive-vertical flag. Without that flag, friction cancels the autorun force every frame and the axis stays at zero."
  - "A pitch floor provider returns DFU's `PitchMaxLimit` in degrees, down-positive, while this game's pitch is up-positive, so it acts as the floor. `pitchFloor` clamps it between -90 degrees and `PITCH_FLOOR`."
dfu: []
tags:
  - "camera"
  - "look"
  - "third-person"
---

# Mouse Look, Move Axes, and Third-Person Camera Order

First-person look smoothing ports DFU `PlayerMouseLook` (`src/player/lookFilter.js`), and movement acceleration ports the `InputManager` force and friction steps (`src/player/moveAxes.js`). The Eye of the Beholder third-person camera (`src/player/eotbCamera.js`) and its billboard logic (`src/player/eotbBillboard.js`) follow the mod, and several of their steps depend on running in a fixed order.
