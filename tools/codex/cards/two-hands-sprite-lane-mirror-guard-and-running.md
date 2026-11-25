---
slug: two-hands-sprite-lane-mirror-guard-and-running
title: "Sprite Lane: Painted Arm, Mirror, Guard, and Running Hands"
domain: combat
kind: subcard
parent: two-hands-overview
files:
  - src/combat/twoHands/twoHands.js
  - src/combat/twoHands/handsLaw.js
  - src/combat/weaponRig.js
  - src/combat/weaponWidget.js
  - src/combat/fpsWeapon.js
  - src/player/headBobber.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Two-Hands.md"
related:
  - two-hands-overview
  - two-hands-morrowind-mirror-rig-and-spread
invariants:
  - "MELEE_PAINTED_ARM is ['R', 'L', 'R', 'L', 'R', 'R', 'L'] by WEAPON10.CIF record index; weapon CIF archives paint only the right arm."
  - "strikePicture uses the record of the state itself unmirrored when its painted arm matches the screen side of the hand (handOnLeft); otherwise it uses the mirrorStrike state record, unmirrored when that matches the screen side and mirrored when not."
  - "GUARD moves a resting fist inward by IN 10 and downward by DOWN 9 design pixels, while a resting weapon only lowers by LOWER 0.12 of its drawn height; the striking hand receives zero offset, and fist bounce moves strictly downward."
  - "RUN_PUMP uses arm record StrikeDownLeft (2) frame 1 with MIN_SPEED 1.0 m/s and AIR_GRACE 0.6 s (runHandsKept), and never lifts a sprite above the bottom screen edge."
  - "runPhaseOfBob(timer) equals timer - PI / 2; runPhaseFollow tracks the head bob within CATCH 0.5 of the stride walk, and otherwise advances forward along the shorter arc."
  - "runHandsWanted requires running, grounded, not crouched, riding, swimming, climbing, or attacking, empty hands, and speed >= MIN_SPEED."
traps:
  - "Never tuck a weapon sprite inward toward the screen center; weapon art is cropped along its outer edge and horizontal shift exposes the cut."
  - "DFU FlipHorizontal mirrors only Idle, StrikeDown, and StrikeUp (FPSWeapon.cs:378); every state of a paired hand is mirrored as a whole."
dfu:
  - Assets/Scripts/Game/FPSWeapon.cs
  - Assets/Scripts/Game/Player/HeadBobber.cs
tags:
  - combat
  - two-hands
  - sprites
  - mirror
  - guard
  - running-hands
---

`createTwoHands` (`src/combat/twoHands/twoHands.js`, mounted by `src/combat/weaponRig.js`) pairs the primary weapon widget (`src/combat/weaponWidget.js`, `src/combat/fpsWeapon.js`) with a cloned off-hand widget created with `handedness: () => false` and initially hidden.

## Painted Arm and Three-Case Strike Mirror

Unarmed records in `WEAPON10.CIF` mix left and right arms across states (`MELEE_PAINTED_ARM = ['R', 'L', 'R', 'L', 'R', 'R', 'L']`), whereas weapon CIF files paint only the right arm. `strikePicture({ state, hand, bareHand, leftHanded })` resolves the screen side via `handOnLeft(hand, leftHanded)` and selects `{ record, mirror }` in three steps:

1. Use `state` unmirrored when its painted arm matches the screen side.
2. Otherwise inspect `mirrorStrike(state)` (which swaps `StrikeLeft`/`StrikeRight` and `StrikeDownLeft`/`StrikeDownRight`) and use it unmirrored when its painted arm matches the screen side.
3. Otherwise use `mirrorStrike(state)` mirrored across the screen via `mirrorRect` and `MIRROR_UV`.

## Resting Guard and Running Hands

When a hand is not striking, `guardOffset` (`GUARD`) shifts an unarmed fist inward by `IN = 10` and downward by `DOWN = 9` design pixels, while lowering an equipped weapon by `LOWER = 0.12` of its drawn height without horizontal shift.

When `runHandsWanted` and `runHandsKept` (`AIR_GRACE = 0.6` seconds) hold, `RUN_PUMP` draws unarmed record `StrikeDownLeft` (`2`), frame `1`, above `MIN_SPEED = 1.0` m/s (`RUN_STEP_M = 2.5` meters per step). `runPhaseOfBob(timer)` (`timer - Math.PI / 2` from `src/player/headBobber.js`) and `runPhaseFollow` (`CATCH = 0.5`) drive alternating downward pumps (`AMP_Y = 12`, `AMP_X = 3`, `BASE_DOWN = 11`).
