---
slug: living-world-indoors-and-lodgers
title: "Indoor Residents, Tables, and Tavern Lodgers"
domain: world
kind: subcard
parent: living-world-overview
files:
  - src/systems/livingWorld/livingIndoors.js
  - src/systems/livingWorld/livingTown.js
  - src/systems/livingWorld/patrons.js
replacesBible:
  - "06-Systems/Living-World.md"
related:
  - living-world-overview
  - living-world-census-schedules-and-watch
  - tavern-card-tables-seating-and-physics
invariants:
  - "An interior room hosts at most `INDOOR_MAX` (`12`) scheduled residents, scaled to one resident per `INDOOR_FLOOR_M2` (`8` square meters) with a floor of `INDOOR_HOLD_MIN` (`3`)."
  - "Indoor walkers stroll at `INDOOR_WALK_SPEED` (`1.2` m/s) between pauses lasting `INDOOR_STIR_S` (`30`–`90` s)."
  - "`soundRoom` probes walkable floor area along `8` compass directions (`ROOM_STEPS`) radiating from the main entrance landing, caching up to `ROOMS_KEPT` (`32`) interiors."
traps:
  - "Player-owned houses and player-rented tavern rooms never populate with random scheduled residents."
  - "Overnight tavern lodgers route to rental beds via `bedsOf` and `bedStand` rather than loitering in the taproom, and `rented` explicitly excludes the player's rented bed."
tags:
  - interiors
  - taverns
  - lodgers
  - conversation-circles
---

Entering a building transitions scheduled residents from street navgrids to interior floor layouts, seating tavern patrons around tables and placing overnight travellers in upstairs beds.

## Room Sounding and Capacity Limits

When the player enters a shop, house, or tavern, `createLivingIndoors` (`src/systems/livingWorld/livingIndoors.js`) queries `LivingTown.insideAt(key, t)` (`src/systems/livingWorld/livingTown.js`) for the exact residents scheduled inside that building at the current simulation minute. Player-owned homes are skipped so random citizens never intrude on private property.

To place walkers without clipping furniture or walls, `soundRoom` marches outward from the entrance landing along `8` directions (`ROOM_STEPS`) to measure usable floor area and caches up to `ROOMS_KEPT` (`32`) sounded interiors. Room capacity scales at one person per `INDOOR_FLOOR_M2` (`8` square meters), clamped between `INDOOR_HOLD_MIN` (`3`) and `INDOOR_MAX` (`12`). Standing residents pause for `INDOOR_STIR_S` (`30`–`90` s) before strolling to a new spot at `INDOOR_WALK_SPEED` (`1.2` m/s).

## Tavern Tables, Facing, and Overnight Lodgers

In taverns and residences, `src/systems/livingWorld/patrons.js` matches scheduled occupants to furniture. `tablesOf` and `spreadTables` group taproom patrons around tables up to `TABLE_MAX` (`3`) seats per table. Residents engaged in table or circle conversations orient their billboards toward their speaking partners rather than facing the player camera.

Travellers staying overnight at an inn do not stand in the common room all night; `bedsOf` and `bedStand` place sleeping lodgers beside upstairs rental beds while excluding any room currently rented by the player (`rented`).
