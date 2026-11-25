---
slug: living-world-ii-adventuring-companies-and-deep-dives
title: "Adventuring Companies, Holy Day Pilgrimages, and Deep Dungeon Dives"
domain: world
kind: subcard
parent: living-world-ii-overview
files:
  - src/systems/livingWorld/companies.js
  - src/systems/livingWorld/deepRoute.js
  - src/systems/livingWorld/trips.js
  - src/systems/livingWorld/dungeonDivers.js
  - src/underwater/deepRemains.js
  - src/scenes/dungeonContext.js
  - src/scenes/world.js
  - src/world/dungeonRespawn.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Living-World-II.md"
related:
  - living-world-ii-overview
  - living-world-roads-trips-and-encounters
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "Dungeon dive routes target only random enemy markers (`STOP_FOE` = `RANDOM_RECORD`) and random treasure markers (`STOP_TREASURE`), never quest markers or boss spawns."
  - "`clearedOf` suppresses reached enemy and treasure markers for `DIVE_CLEAR_MIN` (`DAY_MIN`, 24 game hours) before normal dungeon spawns resume."
  - "The `world.js` clearance check returns null in online sessions and inside the Ocean Holes abyss (`ohAbyss.shouldUpgradeLoot()`), so abyss instances never inherit dive clearance from their template dungeon."
traps:
  - "Evaluate diver proximity despawns (`DEEP_NEAR_M` = `15` m, `DEEP_KEEP_M` = `70` m) against the current diver position along the route rather than the upcoming stop, or divers disappear prematurely."
  - "Place fallen diver remains at their exact route segment coordinate spaced `DEEP_APART_M` (`1.5` m) apart, never at a fallback room center."
dfu: []
tags:
  - companies
  - adventurers
  - dungeon-divers
  - pilgrims
  - clearance
---

City-based adventuring companies and solo residents undertake scheduled dungeon expeditions that temporarily clear non-quest interiors, while temple pilgrims travel on holy days.

## Companies and Holy Day Pilgrimages

In `companies.js`, `companiesOf` groups `COMPANY_SIZE` (`2` to `4`) combat residents into up to `COMPANY_CITY_MAX` (`5`) chartered companies per city. `companyName` generates the charter title, and `headOf` selects the highest-level member to deliver `COMPANY_GREETINGS`. Companies go on dungeon dives at `COMPANY_DIVE_CHANCE` (`0.75`), whereas solo adventurers dive at `DIVE_CHANCE` (`0.55`). In `trips.js`, `holyDayOf` and `holyTrip` dispatch temple pilgrims at `HOLY_CHANCE` (`0.8`) to arrive by `HOLY_IN_H` (`10`).

## Deep Dungeon Routes, Fights, and Clearance

`deepRoute.js` builds interior paths through `stopsOf`, `routeOf`, `stopAt`, `pointAt`, and `stopOfMinute`, visiting random enemy stops (`STOP_FOE` = `RANDOM_RECORD`) for `DEEP_FOE_MIN` (`25` to `40` minutes) and treasure stops (`STOP_TREASURE`) for `DEEP_TREASURE_MIN` (`10` minutes) at `DEEP_WALK_M` (`30` m/min) with detour factor `DEEP_DETOUR` (`1.6`). `deepFightOf` rolls `DEEP_RISK` (`0.5`) per fight lasting `DEEP_FIGHT_MIN` (`20` minutes).

Inside active dungeons (`dungeonDivers.js`, `deepRemains.js`, `dungeonContext.js`, `world.js`, `dungeonRespawn.js`), divers spawn between `DEEP_NEAR_M` (`15` m) and `DEEP_KEEP_M` (`70` m), retreat below `RETREAT_HP` (`0.3`), and leave footprints up to `DIVER_TRAIL_MAX` (`64`) steps spaced by `DIVER_TRAIL_STEP_M` (`0.75` m). Reached stops stay cleared via `clearedOf` and `setFoeDead` for `DIVE_CLEAR_MIN` (`DAY_MIN`) in offline normal dungeons.
