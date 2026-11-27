---
slug: living-world-census-schedules-and-watch
title: "Census, Day Plans, Street Walkers, and the Town Watch"
domain: world
kind: subcard
parent: living-world-overview
files:
  - src/systems/livingWorld/census.js
  - src/systems/livingWorld/dayPlan.js
  - src/systems/livingWorld/places.js
  - src/systems/livingWorld/townPaths.js
  - src/systems/livingWorld/livingTown.js
  - src/systems/livingWorld/meetups.js
  - src/systems/livingWorld/stir.js
  - src/systems/livingWorld/looks.js
  - src/characters/residentWalker.js
  - src/characters/enemySounds.js
  - src/characters/mobilePerson.js
  - src/systems/livingWorld/livingWatch.js
  - src/characters/cityGuards.js
dfu:
  - Assets/Scripts/Game/MobilePersonNPC.cs
replacesBible:
  - "06-Systems/Living-World.md"
related:
  - living-world-overview
  - living-world-relations-and-deeds
  - living-world-indoors-and-lodgers
  - enemy-ai-navmesh-and-combat-tactics
invariants:
  - "`townCensus` builds up to `CENSUS_MAX` (`260`) permanent residents per settlement, and `travellerRoster` selects the subset that takes overland trips."
  - "Street walkers move at `PERSON_MOVE_SPEED` (`1.3` m/s); `LivingTown` can accelerate long commutes up to `WALK_FAST` (`1.6`x) but never slows below base speed."
  - "Town pathfinding budgets `PATH_CELLS` (`8000`) cells per frame normally and `ARRIVAL_PATH_CELLS` (`24000`) on arrival, caching routes in `createPathBook` with at most `PATH_QUEUE_MAX` (`96`) queued requests."
  - "The town watch divides into `WATCH_COMPANIES` (`4`) companies rotating through `WATCH_SHIFTS` (`06`–`14` day, `14`–`22` evening, `22`–`06` night, plus a fourth day off)."
  - "`WatchVoice` throttles the entire watch to one HALT shout every `HALT_GAP_S` (`15` s) across all guards."
  - "Social gatherings maintain `SPACE_M` (`0.9` m) spacing via `circleStands` and `aloneStands` in `meetups.js`."
  - "The second guard of a watch pair (`pair === 1`) never calls the hour, stops a stranger, or breaks up a quarrel; only the first does."
traps:
  - "A schedule day starts at 04:00 (`DAY_START_MIN`), so night shifts cross midnight and require neighboring day plans to stay cached."
  - "In walled cities, `doorsNet` must select the navigation grid component reaching the highest number of building doors, or residents stay trapped indoors."
  - "An alerted guard spawned from a watch resident carries `livingFrom`; only a player kill counts as slaying that resident, and an unslain guard despawning returns the resident to their routine."
  - "Traveller slots are dealt in `TRAVELLER_JOBS`, then `ROAD_JOBS`, then `MORE_JOBS` order; a new job must be appended, or every later `L<mapId>.t<slot>` id and the regard saved under it re-keys."
tags:
  - census
  - day-plan
  - pathfinding
  - city-watch
  - street-incidents
---

Each settlement runs a deterministic daily timetable covering civilian routines, street conversations, navgrid pathing, and rotating city watch patrols.

## Census, Schedules, and Navigation

`townCensus` (`src/systems/livingWorld/census.js`) populates up to `CENSUS_MAX` (`260`) residents per settlement and identifies overland travellers via `travellerRoster`. `dayPlan.js` builds each person's daily cycle starting at `04:00` (`DAY_START_MIN`), sequencing sleep, work, errands, meals, and tavern visits across homes, shops, and social plazas resolved by `townPlaces` and `doorsNet` (`places.js`). In walled cities, `doorsNet` picks the connected navgrid island that reaches the most doors so walkers are not stranded behind perimeter walls.

`createPathBook` (`townPaths.js`) caches street routes and caps pending searches at `PATH_QUEUE_MAX` (`96`), expanding `PATH_CELLS` (`8000`) cells per frame during play and `ARRIVAL_PATH_CELLS` (`24000`) on town entry. `ResidentWalker` (`src/characters/residentWalker.js`, extending `MobilePerson`) walks at `PERSON_MOVE_SPEED` (`1.3` m/s), scaling long walks up to `WALK_FAST` (`1.6`x) in `LivingTown`. `looks.js` assigns armed or class-fitted sprites.

## Social Incidents and the Town Watch

At social plazas, `meetups.js` spaces walkers `SPACE_M` (`0.9` m) apart (`circleStands`, `aloneStands`), while `spotIncidents` and `smallVoice` (`stir.js`) stage street quarrels, haggling, pleas, and gate checks.

The watch divides into `WATCH_COMPANIES` (`4`) rotating through `WATCH_SHIFTS` (`06`–`14`, `14`–`22`, `22`–`06`, and one day off). During pursuits (`livingWatch.js`, `cityGuards.js`), converted watchmen carry `livingFrom` so despawning restores their civilian routine unless the player slays them, and `WatchVoice` (`enemySounds.js`) limits HALT cries to one per `HALT_GAP_S` (`15` s).
