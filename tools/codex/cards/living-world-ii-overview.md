---
slug: living-world-ii-overview
title: "Living World II: Road Occupations, Wagons, Outlaws, Companies, Patrons, and Carried News"
domain: world
kind: overview
parent: null
files:
  - src/systems/livingWorld/census.js
  - src/systems/livingWorld/trips.js
  - src/systems/livingWorld/dayPlan.js
  - src/systems/livingWorld/lines.js
  - src/systems/livingWorld/carried.js
  - src/systems/livingWorld/livingTown.js
  - src/systems/livingWorld/livingRoads.js
  - src/systems/livingWorld/roadStands.js
  - src/systems/survival/camp.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Living-World-II.md"
related:
  - living-world-overview
  - living-world-roads-trips-and-encounters
  - living-world-relations-and-deeds
  - living-world-ii-wagon-trains-and-caravan-counters
  - living-world-ii-outlaw-bands-and-hideouts
  - living-world-ii-adventuring-companies-and-deep-dives
  - living-world-ii-patrons-and-player-traders
invariants:
  - "Road traffic stays deterministic from map data, `lwSeed` seeds, and the sky clock. Only patron purchases come from the account service."
  - "New occupations append to census rosters (`ROAD_JOBS`: carter, hunter, patrol, noble, retainer, and minstrel; `MORE_JOBS`: pedlar, pilgrim, and courier) so existing resident keys stay stable."
  - "News carried by visitors travels one town hop, while a courier `relay` adds one more hop. Local town news is never reported back to the same town as carried news."
  - "Stranger regard from reputation is clamped between `REPUTE_MIN` (`ENEMY_AT + 1`) and `REPUTE_MAX` (`FRIEND_AT - 1`), so heard deeds never make a resident a full friend or enemy."
traps:
  - "Never reorder `ROAD_JOBS` or `MORE_JOBS` entries, because resident identity is keyed by roster position."
  - "`carriedNews` drops any courier relay whose origin matches the current town (`here`) so local deeds are not counted twice."
dfu: []
tags:
  - living-world
  - road-traffic
  - census
  - news
  - determinism
---

Living World II (`LW9` through `LW16`) expands scheduled resident behavior with specialized road jobs, hitched wagon trains, caravan counters, outlaw bands, adventuring companies, offline dungeon clearance, patron purchases, and inter-town rumors.

## Road Traffic, Camps, and Patrols

`census.js` appends `ROAD_JOBS` (carter, hunter, patrol, noble, retainer, and minstrel) and `MORE_JOBS` (pedlar, pilgrim, and courier) at the tail of town rosters so existing resident indices never shift. In `trips.js` and `dayPlan.js`, hunters test up to `WILD_TRIES` (`6`) wilderness points before falling back, market-day travelers visit towns of at least `MARKET_BLOCKS` (`4`) blocks between `MARKET_IN_H` (`12`) and `MARKET_OUT_H` (`13.5`), and minstrels perform during `MINSTREL_PLAY_H` (`18.5` to `23`). Travelers lodge at roadside inns (`INN_TYPE` = `6`) located via `innsAlong`, `nightStop`, `innAhead`, and `innGuestsOf`.

On the road (`livingRoads.js`, `roadStands.js`, `camp.js`), `passingPairs` triggers one `ROAD_PASS_SCRIPTS` exchange when parties meet within `PASS_N` (`1000` native units), while `campGroups` merges camps within `CAMP_SHARE_N` (`2400` native units, `60` m) around a single `FIRE_FLAT` campfire. `patrolCover` marks traveled roads for `PATROL_COVER_DAYS` (`2`), multiplying ambush risk by `PATROL_RISK` (`0.5`), and patrols within `DRAW_M` (`45` m) engage known criminals with `PATROL_HALT_LINES`.

## Carried News and Subcards

`carried.js` and `livingTown.js` retain visitor news (`carriedNews`) for `NEWS_DAYS` (`3`) across one town hop plus one courier `relay` hop. `CARRIED_SHARE` (`0.3`) of town dialogue uses `CARRIED_OPENERS`, and `HEARD_SHARE` (`0.5`) of stranger greetings (`reputeOf`, `greetingFor`, `regardOf`) use `HEARD_GREETINGS` within `[REPUTE_MIN, REPUTE_MAX]`.
