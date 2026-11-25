---
slug: living-world-ii-wagon-trains-and-caravan-counters
title: "Wagon Trains, Caravan Counters, Hold-Ups, Escorts, and Witness Reports"
domain: world
kind: subcard
parent: living-world-ii-overview
files:
  - src/systems/livingWorld/wagons.js
  - src/systems/livingWorld/caravanDoor.js
  - src/systems/livingWorld/relations.js
  - src/systems/livingWorld/trouble.js
  - src/world/roadTeams.js
  - src/travel/horseCartPool.js
  - src/travel/horseCartLaw.js
  - src/trade/shopStock.js
  - src/justice/court.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Living-World-II.md"
related:
  - living-world-ii-overview
  - living-world-roads-trips-and-encounters
  - living-world-relations-and-deeds
  - items-gold-counter-and-wagon
invariants:
  - "`createRoadTeams` renders only the nearest `WAGONS_DRAWN` (`6`) wagons per frame, pairing the classic `ROAD_WAGON_KIND` (`'cart'`) mesh with billboard horse sprites whether or not the vehicle mod is enabled."
  - "An active escort fails once the player stays beyond `ESCORT_KEEP_M` (`300` m) for more than `ESCORT_LOST_MIN` (`60` game minutes), sampled every `ESCORT_SAMPLE_MIN` (`5`) minutes by `escortNear`."
  - "Road interactions persist under the add-only `road` save key (`wares` capped at `WARES_MAX` = `40`, `reports` capped at `REPORTS_MAX` = `40`, and one `escort`) without rewriting existing relation keys."
  - "A road crime reduces regional legal standing (`lowerRepForCrime`) only after a living witness reaches town and delivers the report."
traps:
  - "Witness validation must check active town residents rather than raw census epoch arrays, or valid crime reports will be discarded."
  - "Compute wagon wheel rotation from distance traveled along the axle (`wheelAngleAt`) rather than frame delta time so wheels never spin backward."
  - "Recorded report crimes must belong to `CRIMES` (never `None`) with region indices under `REGION_COUNT`, or `legalRep` receives `NaN`."
dfu: []
tags:
  - wagons
  - caravans
  - escort
  - witness
  - crime
  - rendering
---

Carters and merchant parties haul physical wagon trains between settlements, open roadside trade counters, offer paid escort contracts, and carry witness reports of highway crimes into town.

## Wagon Teams and Rendering

In `wagons.js` and `horseCartLaw.js`, `teamOf`, `trainOf`, `chordBehind`, and `campTeam` arrange draft horses and carts along lanes `LANE_N` (`80` native units) wide, spacing leads by `LEAD_N` (`40`), walkers by `WALK_GAP_N` (`72`), and trailing wagons by `WAGON_TAIL_N` (`110`), with hitches offset at `HITCHED_HORSE_LOCAL_Z` (`3.1`). `cargoOf` assigns the cargo tier. At runtime, `createRoadTeams` (`roadTeams.js`) and `horseCartPool.js` (`drawWagon`, `poseHorseBatch`, `wheelAngleAt`) render the closest `WAGONS_DRAWN` (`6`) wagons using `ROAD_WAGON_KIND` (`'cart'`).

## Counters, Hold-Ups, Escorts, and Witnesses

`caravanDoor.js` builds roadside trading counters via `counterOf` at `CARAVAN_QUALITY` (`1` to `20`), filling inventory through `stockShopShelf` (`shopStock.js`). Counter gold equals `purseOf` (`PURSE_PER_QUALITY` = `300` multiplied by quality), and friendly players receive `FRIEND_DISCOUNT` (`0.1`).

During a hold-up or ambush (`trouble.js`), `yields` checks whether an outnumbered party surrenders its cargo (`ROB_RATIO` = `0.6`, timed by `HALT_MIN` and `FIGHT_MIN`). `escortOffer` opens `ESCORT_OFFER_MIN` (`18 * 60` minutes) before departure, and `escortPay` awards `ESCORT_GOLD_DAY` (`60`) per day, `ESCORT_GOLD_LEVEL` (`15`) per level, and `ESCORT_FIGHT` (`100`) per enemy fought while `escortNear` verifies proximity (`ESCORT_KEEP_M` = `300` m, `ESCORT_LOST_MIN` = `60`, `ESCORT_SAMPLE_MIN` = `5`). `relations.js` stores `wares` (`WARES_MAX` = `40`), `reports` (`REPORTS_MAX` = `40`), and `escort` under `road`, calling `lowerRepForCrime` (`court.js`) when a surviving witness arrives in town.
