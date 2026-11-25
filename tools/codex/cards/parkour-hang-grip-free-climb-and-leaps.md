---
slug: parkour-hang-grip-free-climb-and-leaps
title: "Hanging, Grip Stamina, Free Climb, Leaps and Wall Runs"
domain: world
kind: subcard
parent: parkour-enhanced-climbing-overview
files:
  - src/player/parkour.js
  - src/player/motor.js
  - src/player/collider.js
  - src/scenes/shared.js
  - src/characters/madeLevel.js
routes: []
tables: []
replacesBible:
  - "03-World/Parkour-Arc.md"
related:
  - parkour-enhanced-climbing-overview
  - parkour-ledge-sensing-mantle-vault-and-geometry
  - elite-breach-spire-client-rules-and-telegraphs
invariants:
  - "A fall is caught only within `parkourCatchHold(skill)`, which lerps PARKOUR_CATCH_HOLD_MIN 5 m to PARKOUR_CATCH_HOLD_MAX 15 m."
  - "`gripSeconds(skill, fatigue)` = lerp(6, 30 s) * lerp(0.35, 1, fatigue fraction). The grip drains while hanging, shimmying, or free climbing."
  - "The grip recovers only on the ground or treading water (PARKOUR_GRIP_REGEN_S = 2.5). The 'Your grip is failing.' warning appears at PARKOUR_GRIP_LOW = 0.25, and holds cannot start below PARKOUR_GRIP_MIN = 0.05."
  - "The free-climb collider step uses `noStep` so the wall hug never lifts the body on a stair step."
traps:
  - "The `_freeStart` walk-in timer (`freeStartSeconds`: 0.6 s at skill 0 down to 0.3 s at 100) resets while `deps.hold()` is true, i.e. at a profession node or during a playing act."
  - "The running leap is refused when the made level's `runLeap` rule is 'refused' (Elite Gates spans proven with the plain jump)."
  - "PARKOUR_COYOTE_S = 0.15 allows a late press after the edge to still leap."
dfu:
  - Assets/Scripts/Game/Player/ClimbingMotor.cs
tags:
  - parkour
  - hang
  - shimmy
  - grip
  - free-climb
  - leap
  - wall-run
---

# Hanging, Grip Stamina, Free Climb, Leaps and Wall Runs

Beyond instant mantles and vaults, `src/player/parkour.js` and `src/player/motor.js` govern wall holds, grip stamina, free climbing, running leaps, and wall runs.

## Catch Window and Grip Stamina

- **Fall catch (`planCatch`):** Airborne players can catch a hold only within `parkourCatchHold(skill)`, which lerps `PARKOUR_CATCH_HOLD_MIN` (`5` m) to `PARKOUR_CATCH_HOLD_MAX` (`15` m).
- **Grip pool (`gripSeconds`):** Hold duration scales with Climbing skill and Fatigue: `lerp(6, 30)` seconds times `lerp(0.35, 1, fatigueFraction)`. Grip drains during `_hangStep`, `_pkShimmy`, and `_freeClimbStep`, blocks new holds below `PARKOUR_GRIP_MIN` (`0.05`), warns `"Your grip is failing."` at `PARKOUR_GRIP_LOW` (`0.25`), and regenerates over `PARKOUR_GRIP_REGEN_S` (`2.5` s) only on the ground or treading water.

## Free Climbing, Corners, Leaps, and Wall Runs

- **Hanging and free climb:** `senseGrip`, `senseLeapHold`, `senseOverHang`, and `wallContact` detect holds using `PARKOUR_LIP_FOLLOW` (`0.15` m) and `PARKOUR_HAND_SPAN` (`0.25` m). `shimmySpeed` lerps `0.6` to `1.4` m/s, and `freeClimbSpeed` multiplies classic `climbingSpeed` by `lerp(0.7, 1.3)`, both applying the over-100 Climbing soft cap. Walk-in free climb starts after `freeStartSeconds` (`0.6` s at skill `0` to `0.3` s at `100`), resetting while `deps.hold()` is true (`src/scenes/shared.js`). Free climb passes `noStep` to `src/player/collider.js` and steps through `_fcTopOut`, `_fcFaceTop`, `_fcCornerSide`, `_fcCornerWall`, `_pkCorner` (`planCorner`), and `_pkLowerStart`.
- **Leaps and wall runs:** `_pkLaunch` allows `PARKOUR_COYOTE_S` (`0.15` s) after an edge unless the made level (`src/characters/madeLevel.js`) sets `runLeap` to `'refused'`. `_wallStep` and `_wallEnd` run wall traversal. Elite Gates route proofs (`src/net/eliteGates/egRouteProof.js`) reuse `gripSeconds`, `freeClimbSpeed`, and `freeStartSeconds`.
