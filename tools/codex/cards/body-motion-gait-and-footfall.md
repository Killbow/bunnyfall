---
slug: body-motion-gait-and-footfall
title: "Body Motion Gait: Alexander Stride, Planted Feet, and Turns"
domain: characters
kind: subcard
parent: body-motion-overview
files:
  - src/characters/bodyMotion/gait.js
  - src/characters/bodyMotion/bodyKit.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Body-Motion.md"
  - "01-Overview/audits/Audit-Body-Motion.md"
related:
  - body-motion-overview
  - body-motion-melee-blows-and-solver
invariants:
  - "strideLength(v, h, style) = min(2.3 * h * (v^2 / (G * h))^0.3, style.strideMax * h), and it returns 0 when standing."
  - "dutyFactor lerps style.duty[0] to style.duty[1] by Froude number over style.frFull."
  - "The gait is paced by ground actually crossed (`travel`). It comes on above GAIT_LIMITS.on 0.2 m/s and goes off below off 0.1 m/s, so a body pushing at a wall stands. A frame faster than placed 60 m/s counts as a placement, not a stride."
  - "liftProfile(s) is 0 at both ends and peaks a third of the way in (LIFT_A 1, LIFT_B 1.7)."
traps:
  - "A turn above TURN.snap 90 degrees in one frame, or faster than rate 9 rad/s, re-plants both feet. Otherwise a foot twisted past step 26 degrees steps back under the body, and one past max 70 steps at once."
  - "STEER: hips turn forward 0.68 of a strafe's angle (max 60 degrees). Past back 105 degrees (hyst 12) the body backpedals, turning the hips by backShare 0.55 of the angle (backMax 40 degrees)."
  - "TURN.quick is 0.16 s while TURN.minTime is 0.12 s, and rotating ship decks pass yaw deltas through carriedYaw rather than on-the-spot turns."
dfu: []
tags:
  - body-motion
  - gait
  - stride
  - feet
  - turning
---

# Body Motion Gait: Alexander Stride, Planted Feet, and Turns

The third-person gait paces walk, run, and sneak from actual ground crossed, locking planted feet in place while swinging airborne feet along minimum-jerk and flight paths.

- **Alexander Stride and Styles (`src/characters/bodyMotion/gait.js`):** `stepGait` steps `createGaitState()` from `travel` (on above `GAIT_LIMITS.on = 0.2` m/s, off below `off = 0.1` m/s, and treating jumps above `placed = 60` m/s as placements). `strideLength(v, h, style)` returns `min(2.3 * h * (v^2 / (G * h))^0.3, style.strideMax * h)` with `GAIT_STYLES` `strideMax` caps of `2.0` (`walk`), `4.1` (`run`), and `1.3` (`sneak`). `dutyFactor` lerps `style.duty[0]` to `style.duty[1]` over `style.frFull`. `blendStyle` applies `BODY_STYLES` (`female` width `0.72`, `hipList = 1.35`; `beast` `bob = 1.25`, `footBias = -6`).
- **Rockers, Slope, and Carriage (`src/characters/bodyMotion/gait.js`, `src/characters/bodyMotion/bodyKit.js`):** `SLOPE` (`{ shorten: 0.5, shift: 0.5, shiftMax: 0.75 }`) adjusts stances on grades, and `STAND.sneak` crouches height to `0.84`. `stancePitch`, `swingPitch`, `footPlace`, and `footPlaceOn` roll feet across heel and forefoot rockers (`FOOT`), while `liftProfile(s)` peaks one-third in (`LIFT_A = 1`, `LIFT_B = 1.7`). `gaitPose` and private `hipPlan` assemble the pose.
- **Steer and Turns (`STEER`, `TURN`):** `STEER` turns hips `0.68` of a strafe angle (max `60` deg) and backpedals past `105` deg (`hyst = 12`, `backShare = 0.55`, `backMax = 40` deg). Under `TURN`, a turn above `snap = 90` deg or `rate = 9` rad/s re-plants both feet; feet twisted past `step = 26` deg step back under `standingSpot`, and past `max = 70` deg step at once.
