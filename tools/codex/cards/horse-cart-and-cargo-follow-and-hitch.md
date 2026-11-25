---
slug: "horse-cart-and-cargo-follow-and-hitch"
title: "Horse Following, the Wagon on Its Shafts, and Where a Dismount Parks"
domain: "travel"
kind: "subcard"
parent: "horse-cart-and-cargo-overview"
files:
  - "src/travel/horseFollow.js"
  - "src/travel/horseCart.js"
  - "src/travel/horseCartLaw.js"
  - "src/travel/trailingPoseCache.js"
  - "src/travel/horseCartPool.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Cart-And-Cargo.md"
related:
  - "horse-cart-and-cargo-overview"
  - "wagons-bench-team-and-harness"
  - "wagons-kinds-and-hitching-overview"
  - "horse-teams-pose-cadence-and-dye-budget"
invariants:
  - "HorseFollowPath keeps PATH_RETAINED_DISTANCE = 45 m of trail sampled every PATH_SAMPLE_DISTANCE = 0.08 m. A step past PATH_DISCONTINUITY_DISTANCE = 20 m breaks the path."
  - "hitchJumpReach(dt) = TELEPORT_DISTANCE (20) + HITCH_JUMP_SPEED (30) * dt. When the hitch moves farther in one step, WagonHitch.observe triggers relayHitch() instead of swinging the wagon across the gap."
  - "The hitched horse stands HITCHED_HORSE_LOCAL_Z = 3.1 m ahead of the wagon (HITCHED_HORSE_LOCAL_X = 0)."
  - "A dismount parks at trailingPose.dismountPose(deploymentPoseBehindPlayer): the cached trailing axle pose if there is one, otherwise a pose behind the player (WAGON_FOLLOW_DISTANCE 2.5 plus DEPLOY_CLEARANCE 1.0)."
traps:
  - "trailingPose.store caches wagonAxle(), not the elevated visual position. Mode transitions call trailingPose.forget() so a stale pose never parks the wagon."
  - "warnIfParkedFar only logs a console warning ('[TrailingWagon] A dismount parked the wagon ...') when the park lands more than TELEPORT_DISTANCE from the player. It does not move the wagon."
  - "Overworld growth: grownHitchedPosition scales the drawn wagon about its hitch and grownWheelStep slows the wheel clock by g. Grown wagons draw with NO_SHADOW ({ noShadow: true })."
dfu: []
tags:
  - "horse-cart-and-cargo"
  - "follow"
  - "hitch"
  - "wagon-hitch"
  - "stale-park"
  - "dismount"
---

# Horse Following, the Wagon on Its Shafts, and Where a Dismount Parks

Path sampling, shaft hitching, and dismount parking coordinate across `src/travel/horseFollow.js`, `src/travel/horseCart.js`, `src/travel/horseCartLaw.js`, `src/travel/trailingPoseCache.js`, and `src/travel/horseCartPool.js`.

- **Follow trail and evasion:** `HorseFollowPath` (`HorseFollowController`) retains `PATH_RETAINED_DISTANCE = 45` m sampled every `PATH_SAMPLE_DISTANCE = 0.08` m, breaking on steps past `PATH_DISCONTINUITY_DISTANCE = 20` m. Follow distance defaults to `DEFAULT_HORSE_FOLLOW_DISTANCE = 3` (`2` to `8`), with catch-up at `6` m and strong catch-up at `12` m across speeds `GENTLE` (`1.25`), `NORMAL` (`2.8`), `CATCH_UP` (`5`), `STRONG_CATCH_UP` (`7`), and `EVASION` (`6` m/s). Seven `DETOUR_ANGLES` (`[0, ±30, ±60, ±90]`), `STUCK_TIMEOUT = 4.5` s, `EVADE_RINGS` (`[6, 10, 15, 20, 25, 30]`), and `THREAT_CLEARANCE = 15` steer around obstacles and hostile targets.
- **Shaft hitch, grounding, and dismount:** A hitched horse stands `HITCHED_HORSE_LOCAL_Z = 3.1` m ahead (`HITCHED_HORSE_LOCAL_X = 0`). When a step exceeds `hitchJumpReach(dt) = TELEPORT_DISTANCE (20) + HITCH_JUMP_SPEED (30) * dt`, `WagonHitch.observe` calls `relayHitch()`. Grounding eases via `POSITION_SMOOTHING_RATE = 12` and `ROTATION_SMOOTHING_RATE = 10` (`GROUND_RAY_HEIGHT = 8`, `GROUND_RAY_DISTANCE = 40`, `GROUND_RETRY_SECONDS = 1`). `trailingPose.store` caches `wagonAxle()`, `trailingPose.forget()` clears on mode changes, and `dismountPose` falls back to `WAGON_FOLLOW_DISTANCE` (`2.5`) plus `DEPLOY_CLEARANCE` (`1.0`), while `warnIfParkedFar`, `hitchDeployedWagon`, `grownHitchedPosition`, `grownWheelStep`, and `NO_SHADOW` handle parks and overworld scale.
