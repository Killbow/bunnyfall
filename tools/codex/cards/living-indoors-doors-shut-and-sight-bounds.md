---
slug: "living-indoors-doors-shut-and-sight-bounds"
title: "Indoor Room Sounding with Doors Shut, Sight Clamps, and Day-Plan Stays"
domain: "world"
kind: "subcard"
parent: "living-world-overview"
files:
  - "src/systems/livingWorld/livingIndoors.js"
  - "src/systems/livingWorld/livingWorldHost.js"
  - "src/systems/livingWorld/dayPlan.js"
  - "src/world/actionSystem.js"
  - "src/scenes/world.js"
  - "src/scenes/worldModes.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-LW-Rooms.md"
related:
  - "living-world-overview"
  - "living-world-indoors-and-lodgers"
  - "living-world-census-schedules-and-watch"
  - "tavern-card-tables-seating-and-physics"
invariants:
  - "`soundRoom` (`src/systems/livingWorld/livingIndoors.js`) measures interiors up to `INDOOR_REACH_M = 20` m and `INDOOR_CELLS = 400` inside `ActionSystem.withDoorsShut` (`deps.doorsShut`) while keeping `INDOOR_CLEAR_M` (`1.1` m) from `staticFeet` and bed stands."
  - "Cells more than `INDOOR_LEVEL_M` (`0.15` m) above the floor mark as `lifted` (walked across, never stood on), `stirPlace` joins tables at least `CROWD_M` (`2.5` m) from other occupied tables (`TABLE_M = 2.2`, `INDOOR_APART_M = 1.3`), and `faceOf` raycasts open directions up to `OPEN_M` (`6` m)."
  - "Arrivals and departures beyond `INDOOR_SEEN_M` (`14` m) occur only while out of `inView`, and `livingPersonsAct` clamps talk and steal rays against the interior collider so walls block interaction."
  - "In `src/systems/livingWorld/dayPlan.js`, stays shorter than `MIN_STAY` (`8` min) drop, and between two stays at the same indoor place (`OUTDOOR.has(it.kind)` false) residents go home when the gap exceeds walk-home plus walk-back plus `HOME_GAP` (`30` min)."
traps:
  - "Never measure rooms against live door swing angles; `roomKeyOf` hashes `staticFeet`, beds, entrances, and `collider.shapeKey()`, while `questFeet` are excluded only at placement time and never folded into `roomKeyOf`."
  - "Adding a place kind to `OUTDOOR` (`walk`, `market`, `social`, `stall`, `beg`, `dock`, `watch`, `post`, `gate`) keeps lingerers on site between consecutive stays."
dfu: []
tags:
  - "living-world"
  - "interiors"
  - "npc-placement"
  - "day-plan"
---

# Indoor Room Sounding with Doors Shut, Sight Clamps, and Day-Plan Stays

`livingWorldHost.js` wires `staticFeet`, `questFeet`, and `doorsShut` into `src/systems/livingWorld/livingIndoors.js` so room geometry, resident placement, and sight bounds stay consistent across interior layouts.

- **Doors-shut room sounding:** `soundRoom` scans up to `INDOOR_REACH_M = 20` m and `INDOOR_CELLS = 400` inside `ActionSystem.withDoorsShut` (`src/world/actionSystem.js`) while holding `INDOOR_CLEAR_M` (`1.1` m) from `staticFeet` and bed stands. Cache keys from `roomKeyOf` hash `staticFeet`, beds, entrances, and `collider.shapeKey()`, excluding `questFeet` only at placement time. Cells above `INDOOR_LEVEL_M` (`0.15` m) mark as `lifted` so residents walk across raised steps without standing on them.
- **Table spacing, sight, and ray clamps:** `stirPlace` selects tables at least `CROWD_M` (`2.5` m) from other occupied tables (`TABLE_M = 2.2`, `INDOOR_APART_M = 1.3`), while `faceOf` raycasts open facings up to `OPEN_M` (`6` m). Arrivals and departures beyond `INDOOR_SEEN_M` (`14` m) happen only outside `inView`, and `livingPersonsAct` (`src/scenes/world.js`, `src/scenes/worldModes.js`) clamps talk and steal rays against the interior collider.
- **Day-plan stay pruning:** `src/systems/livingWorld/dayPlan.js` drops stays under `MIN_STAY` (`8` min) and sends indoor residents (`OUTDOOR.has(it.kind)` false) home between consecutive stays when the gap exceeds round-trip walking plus `HOME_GAP` (`30` min).
