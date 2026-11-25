---
slug: dungeon-trail-and-way-out
title: "Automap Trail Fill and the Way-Out Field"
domain: world
kind: subcard
parent: dungeon-exploration-aids-overview
files:
  - src/maps/automap.js
  - src/player/wayOut.js
  - src/scenes/dungeonContext.js
  - src/ui/enhancedHud.js
routes: []
tables: []
replacesBible:
  - `01-Overview/audits/Audit-Delve.md`
  - `03-World/Delve-Arc.md`
related:
  - dungeon-exploration-aids-overview
  - held-map-ink-cartography-and-zoom-bands
invariants:
  - "`automapTrailTick` samples feet on a `TRAIL_CELL` (`1` m) grid at `5` Hz. A step of up to `TRAIL_FILL_M` (`3` m) between samples is filled cell by cell. Past that distance the player was carried (teleporter, fall, or load), and nothing in between is filled."
  - "A fall landing more than `TRAIL_FALL_M` (`1` m) below its start is not filled, whereas a landing within `TRAIL_LAND_FILL_M` (`2 * TRAIL_FILL_M`) is filled."
  - "The way-out field is a breadth-first walk outward from the entrance over trail cells (`8` neighbors plus the vertical column, within `WAY_STEP_DY = 1` m). Teleporters form one-way edges (`teleporterConnection`)."
  - "The field rebuilds immediately when the trail shrinks, the entrance moves, or a teleporter is used. It rebuilds every `WAY_REFIELD_S` (`10` s) while the trail grows under the player, and at most every `WAY_FIELD_S` (`1` s) with backoff while the player is off the field."
  - "Each step is queried via `stepClear` once and cached. `wayStepClear` casts a waist-high (`0.9` m) ray against the dungeon bucket only (`PROF_VEIN_ONLY`), and `stepHitCuts` ignores hits within `WAY_STEP_END_M` (`0.25` m) of either endpoint."
traps:
  - "One build queries at most `WAY_STEP_ASKS` (`2000`) steps, paced by `WAY_ASK_MS`. Unqueried steps are assumed clear until checked."
  - "`cellColumn` packs `[x, z]` into one numeric key. Do not build string keys per lookup (dungeon audit B2)."
dfu: []
tags:
  - dungeon
  - automap
  - trail
  - way-out
  - pathfinding
  - dungeon-audit
---

`src/maps/automap.js` and `src/player/wayOut.js` record the footprint grid and maintain a breadth-first return field wired through `src/scenes/dungeonContext.js` and `src/ui/enhancedHud.js` (`dungeon-exploration-aids-overview`, `held-map-ink-cartography-and-zoom-bands`).

## Trail Sampling and Gap Filling

`automapTrailTick` (`src/maps/automap.js`) samples player feet at `5` Hz onto a `TRAIL_CELL` (`1` m) grid (`'x,y,z'` keys). Moves up to `TRAIL_FILL_M` (`3` m) interpolate intermediate cells; larger jumps indicate a teleport, fall, or load and leave the span empty. Drops past `TRAIL_FALL_M` (`1` m) skip downward fill, whereas landing runout within `TRAIL_LAND_FILL_M` (`2 * TRAIL_FILL_M`) is filled. `trailCells(trail, cells)` (`src/player/wayOut.js`) incrementally extends cell points and indexes vertical columns with numeric `cellColumn` keys packed from `[x, z]`.

## Way-Out Field and Raycast Budget

The solver walks outward from the entrance over visited cells (`8` neighbors plus same-column steps within `WAY_STEP_DY` `1` m) and one-way `teleporterConnection` edges. It snaps within `WAY_SNAP_M` (`2.5` m), looks ahead `WAY_LOOK_CELLS` (`14`) cells, hides within `WAY_HERE_M` (`3` m) of the exit, and inks arrows with `WAY_MARK_CSS` (`'#efe6cf'`) and `WAY_BODY_CSS` (`'#2b2418'`).

Rebuilds fire immediately on trail contraction, entrance moves, or teleporter use, every `WAY_REFIELD_S` (`10` s) as the trail grows, and at most every `WAY_FIELD_S` (`1` s) with backoff when off-field. `stepClear` caches waist-high (`0.9` m) `wayStepClear` rays against `PROF_VEIN_ONLY` (`stepHitCuts` trims `WAY_STEP_END_M` `0.25` m from each end), capped at `WAY_STEP_ASKS` (`2000`) queries per pass and paced by `WAY_ASK_MS`.
