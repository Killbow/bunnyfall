---
slug: body-motion-melee-blows-and-solver
title: "Body Motion Melee Blows and Full-Body Solver"
domain: characters
kind: subcard
parent: body-motion-overview
files:
  - src/characters/bodyMotion/melee.js
  - src/characters/bodyMotion/bodySolve.js
  - src/characters/bodyMotion/bodyMotion.js
  - src/combat/climbRig.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Body-Motion.md"
  - "01-Overview/audits/Audit-Body-Motion.md"
related:
  - body-motion-overview
  - body-motion-weapon-carry-classes
  - body-motion-gait-and-footfall
invariants:
  - "U { windup 0.3, hit 0.5 }. blowU maps the section to u: 'windup' -> 0.3 * smooth(p); 'release' -> 0.3 + 0.2 * p^1.6 (fastest at contact); 'follow' -> 0.5 + 0.5 * (1 - (1-p)^2)."
  - "meleeFamilyOf: 'one'/'dual' -> 'one'; 'two'/'wide'/'spear' -> 'two'; 'fists' -> 'fists'; anything else -> null (the clip owns it)."
  - "solveBody writes each local rotation through orthonormal (climbRig.js, a Gram-Schmidt step that keeps handedness), so float32 skew does not compound down deep chains."
  - "The legs reach their ankles through climbRig.js solveReach, so the gait keeps walking under a blow."
  - "The solve places hips, trunk, head, and legs before the arms. `arms(ctx)` is asked after the trunk is placed, because hand targets are read off the shoulders they hang from."
traps:
  - "A blow thrown while strafing takes back BLOW_TRUNK.steer 0.6 of the gait steer and caps the chest twist off the hips at 50 degrees (AUDIT MELEE-8)."
  - "MELEE keys are written for the right hand only. Left-hand blows (dual-wield, a left fist) are mirrored."
  - "The trunk bones are decided top down in one pass and the skeleton is composed once after. A `turn` recomposes its whole subtree, so turning bone by bone costs several full compositions per body per frame."
dfu: []
tags:
  - body-motion
  - melee
  - blows
  - ik
  - orthonormal
---

# Body Motion Melee Blows and Full-Body Solver

Melee choreography splines whole-body weapon and fist arcs timed to the combat hit frame, while the full-body solver applies trunk turns and two-bone limb IK without float32 skew.

- **Section Timing and Blow Splines (`src/characters/bodyMotion/melee.js`, `src/characters/bodyMotion/bodyMotion.js`):** `meleeFamilyOf(cls)` maps `'one'` and `'dual'` to `'one'`, `'two'`, `'wide'`, and `'spear'` to `'two'`, `'fists'` to `'fists'`, and other classes to `null`. `blowName(type, reversed)` maps reversed slashes to `'back'` alongside `'chop'`, `'slash'`, and `'thrust'` in `MELEE[family][blow]`. With `U = { windup: 0.3, hit: 0.5 }`, `blowU(section, progress)` maps `'windup'` to `0.3 * smooth(p)`, `'release'` to `0.3 + 0.2 * p^1.6` (fastest at contact), and `'follow'` to `0.5 + 0.5 * (1 - (1 - p)^2)`. `blowPose` interpolates right-hand keys from the active carry hand (`from`) and mirrors left-hand strikes across the midline, while `windFor(strength)` lerps trunk wind between `STRENGTH_WIND.lo = 0.65` and `1`.
- **Strafe Unwinding and Twist Cap (`BLOW_TRUNK`):** While striking during a strafe, `bodyMotion.js` reclaims `BLOW_TRUNK.steer = 0.6` of the gait hip steer toward facing and caps chest yaw within `BLOW_TRUNK.twist = 50` deg of the hips.
- **Trunk and Limb Solver (`src/characters/bodyMotion/bodySolve.js`, `src/combat/climbRig.js`):** `solveBody` rotates the pelvis and thigh-parent bone, spreads chest rotation across `TRUNK_SHARE`, levels the head, and translates the root to the hip target. Legs and arms solve via `solveReach`, keeping the gait walking under a blow, clamping airborne ankles to `ANKLE = { dorsi: 25, plantar: 50 }` deg, and passing written local rotations through `orthonormal`.
