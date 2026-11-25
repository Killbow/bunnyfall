---
slug: wagons-bench-team-and-harness
title: "Wagon Bench Driver, Two-Horse Team, Bogie Steering, and Harness Ropes"
domain: travel
kind: subcard
parent: wagons-kinds-and-hitching-overview
files:
  - src/world/wagonModels.js
  - src/player/seatPose.js
  - src/player/mwView.js
  - src/travel/horseFollow.js
  - src/travel/wagonRopes.js
  - src/travel/horseCartPool.js
  - src/net/remotePlayers.js
  - src/scenes/exterior.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagons.md"
related:
  - wagons-kinds-and-hitching-overview
  - wagons-open-wagon-riders-and-seats
  - horse-teams-pose-cadence-and-dye-budget
  - horse-care-tiers-overview
invariants:
  - "The Open Wagon and Caravan need two Horse items to hitch. With only one, wagonTeamShort returns the refusal. With none, the mod's own needHorseToPull refusal applies."
  - "On bench kinds the driver sits on the bench (driverSeatFor, SEATED_EYE_HEIGHT), while the puller capsule stays at the hitch."
  - "The camera floor sits SHELL_CLEAR_M = 0.35 m above the wagon shell's highest corner (cameraFloor)."
traps:
  - "nearestOnWagon measures along the run of hitchZ() - HITCHED_HORSE_LOCAL_Z, so long hitches still reach."
  - "src/scenes/exterior.js draws wagons, the bench and teams, but it has no caravan room, riders or visits."
dfu: []
tags:
  - wagons
  - bench
  - horses
  - steering
  - harness
  - camera
---

# Wagon Bench Driver, Two-Horse Team, Bogie Steering, and Harness Ropes

Open Wagons and Caravans seat the driver on an elevated front bench behind a two-horse team with two-bar bogie steering and Verlet harness ropes (`src/world/wagonModels.js`, `src/travel/horseFollow.js`, `src/travel/wagonRopes.js`, `src/scenes/world.js`, `src/scenes/exterior.js`).

- **Two-horse requirement, bench pose, and camera (`src/travel/horseFollow.js`, `src/player/seatPose.js`, `src/player/mwView.js`, `src/net/remotePlayers.js`):** Hitching an Open Wagon or Caravan requires two Horse items; holding one triggers `wagonTeamShort`, while holding none triggers `needHorseToPull`. On bench kinds, `driverSeatFor` and `SEATED_EYE_HEIGHT` place the driver on the bench while keeping the puller capsule at the hitch. Remote peers on the bench send `bench: 2` and render via `driverGlue`. `cameraFloor` keeps the camera `SHELL_CLEAR_M` (`0.35` m) above the highest shell corner.
- **Kinematics, ropes, pitch, and overworld scale (`src/world/wagonModels.js`, `src/travel/wagonRopes.js`, `src/travel/horseCartPool.js`, `src/scenes/exterior.js`):** Four-wheel rigs trail with two-bar bogie kinematics (`bogieAxle`) clamped by `steerLimitOf` (about `6.85` degrees for the open wagon and caravan), while `nearestOnWagon` measures along `hitchZ() - HITCHED_HORSE_LOCAL_Z` so long hitches stay reachable. `src/travel/wagonRopes.js` solves harness ropes as Verlet chains. An unhitched Small Cart tilts to `CART_REST_PITCH_DEG` (about `10.1` degrees, from `MEASURED.cart`) with level UVs via `cartLevel`. Overworld rigs scale by `rigGrowOf(g, kind) = max(1, g * min(1, RIG_READ_M / rigLengthOf))` (`RIG_READ_M` `4`), and `src/scenes/exterior.js` draws wagons, benches, and teams without caravan rooms or visits.
