---
slug: living-world-roads-trips-and-encounters
title: "Overland Trips, Caravans, Road Encounters, and Dungeon Divers"
domain: world
kind: subcard
parent: living-world-overview
files:
  - src/systems/livingWorld/trips.js
  - src/systems/livingWorld/ways.js
  - src/systems/livingWorld/trouble.js
  - src/systems/livingWorld/lives.js
  - src/systems/livingWorld/wagons.js
  - src/systems/livingWorld/caravanDoor.js
  - src/systems/livingWorld/deepRoute.js
  - src/systems/livingWorld/keepsake.js
  - src/systems/livingWorld/portCrews.js
  - src/systems/livingWorld/livingRoads.js
  - src/underwater/deepRemains.js
  - src/systems/livingWorld/roadStrike.js
  - src/systems/livingWorld/roadFights.js
  - src/systems/livingWorld/roadStands.js
  - src/systems/livingWorld/dungeonDivers.js
  - src/characters/exteriorFoes.js
  - src/world/dryGround.js
  - src/systems/naval/seaLanes.js
replacesBible:
  - "06-Systems/Living-World.md"
related:
  - living-world-overview
  - living-world-relations-and-deeds
  - naval-and-come-sail-away
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "Overland ambush risk accrues at `RISK_PER_DAY` (`0.09`) up to `RISK_MAX` (`0.55`), and each road ambush spawns at most `FOES_MAX` (`6`) enemies."
  - "Live road fights materialize within `LIVE_M` (`150` m) and despawn beyond `LIVE_KEEP_M` (`260` m) or `LIVE_GRACE_MIN` (`90` min) after combat resolves."
  - "Travelling parties march single-file spaced by `FILE_GAP_N` (`72` native units, `1.8` m) and pitch camp on a `CAMP_RING_N` (`90` native units, `2.25` m) circle verified on dry land via `createDryGround` (`sampleKernel`)."
  - "`ways.js` computes at least `WAYS_PER_FRAME` (`2`) inter-town routes per frame within a `WAYS_MS_PER_FRAME` (`2` ms) budget, capped at `WAYS_MAX_PER_FRAME` (`32`)."
  - "Fallen dungeon diver remains persist for `DEEP_REMAINS_MIN` (`3 * DAY_MIN`), and `TURNS_MAX` (`200`) bounds each saved category of permanent resident fate (`spared`, `fallen`)."
traps:
  - "Road ambush enemies spawn through `spawnFoe` (`src/characters/exteriorFoes.js`) as temporary encounter entities; never persist them to the save file."
  - "When a road party loses an ambush near the player, surviving enemies transfer into the active exterior encounter pool to pursue the player."
tags:
  - trips
  - caravans
  - road-encounters
  - dungeon-divers
  - keepsakes
  - sailors
---

Beyond town borders, scheduled residents travel inter-town roads in caravans, camp overnight, fight road ambushes, explore dungeons, and crew harbor packets.

## Overland Trips, Caravans, and Road Ambushes

`ways.js` solves inter-town road paths at `WAYS_PER_FRAME` (`2`) to `WAYS_MAX_PER_FRAME` (`32`) pairs per frame within `WAYS_MS_PER_FRAME` (`2` ms). `trips.js` and `formCaravans` bundle travellers with wagons (`wagons.js`) and hired mercenary escorts (`caravanDoor.js`), marching single-file `FILE_GAP_N` (`72` native units, `1.8` m) apart and camping on a `CAMP_RING_N` (`90` native units, `2.25` m) ring checked against water by `createDryGround` (`sampleKernel` in `src/world/dryGround.js`).

Trip danger climbs at `RISK_PER_DAY` (`0.09`) up to `RISK_MAX` (`0.55`). `trouble.js` resolves ambushes into `driven`, `won`, `fled`, `fell`, or `robbed` outcomes with recovery halts (`HALT_MIN`). When the player approaches within `LIVE_M` (`150` m), `roadFights.js` and `roadStands.js` spawn up to `FOES_MAX` (`6`) temporary enemies via `spawnFoe` (`src/characters/exteriorFoes.js`), clearing them beyond `LIVE_KEEP_M` (`260` m) or after `LIVE_GRACE_MIN` (`90` min). If the travellers fall, surviving enemies turn on the player.

## Dungeon Divers, Keepsakes, and Port Crews

`deepRoute.js` and `dungeonDivers.js` send adventurer parties into dungeons. Fallen divers leave corpses (`deepRemains.js`) for `DEEP_REMAINS_MIN` (`3 * DAY_MIN`) carrying family heirlooms (`keepsake.js`) that players can recover and return. `lives.js` records up to `TURNS_MAX` (`200`) permanent `spared` or `fallen` turns. On the coast, `portCrews.js` assigns town sailors to `seaLanes.js` ships (`berthOf`, `sailorAt`, `crewsAshore`).
