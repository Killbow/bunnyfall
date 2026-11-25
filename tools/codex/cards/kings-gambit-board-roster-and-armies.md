---
slug: kings-gambit-board-roster-and-armies
title: "King's Gambit Board Generation, Bestiary Roster, and Army Budget"
domain: multiplayer
kind: subcard
parent: kings-gambit-overview
files:
  - src/net/kingsGambit.js
  - src/characters/enemyBasics.js
  - src/cards/cardSources.js
  - src/world/mathf.js
  - src/net/dice.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Kings-Gambit.md"
related:
  - kings-gambit-overview
  - kings-gambit-turns-combat-and-hazards
  - iliac-card-items-sources-and-customs
invariants:
  - "The board measures `KG_COLS` (`15`) by `KG_ROWS` (`13`); walls, pillars, water, and hazards spawn only within rows `KG_ZONE_TOP` (`3`) through `KG_ZONE_BOTTOM` (`9`), and `setTile` always writes the point-mirrored cell `(14 - c, 12 - r)`."
  - "`buildMap` attempts up to `KG_MAP_TRIES` (`30`) layouts across `KG_LAYOUTS` (`pillared-hall`, `guard-rooms`, `ruined-keep`, and `moat-and-bridges`) with `KG_HAZARD_PAIRS_AT_START` (`3`) active hazard pairs, accepting the first where `mapIsPlayable` confirms `(7, 0)` is reachable from `(7, 12)` and at least `97%` (float32) of floor cells connect; after 30 failures it falls back to `KG_OPEN_FIELD`."
  - "`armyRefusal` rejects invalid rosters with `'shape'`, `'empty'`, `'units'` (above `KG_MAX_UNITS` `12`), `'unit'`, or `'points'` (above budget, default `KG_POINT_BUDGET` `300`); the king costs `0` and does not count against `KG_MAX_UNITS`."
traps:
  - "In `KG_TILE` (`{floor: 0, wall: 1, pillar: 2, water: 3}`), only `floor` is walkable, while only `wall` and `pillar` block line of sight (`blocksSight`), allowing ranged units to fire across `water`."
  - "`makeUnit` evaluates attack and cost in float32 using Unity `RoundToInt` (round half to even) from `src/world/mathf.js`; using float64 alters unit costs."
  - "`autoFill` stops when no unit fits the remaining budget or after `KG_AUTOFILL_ROUNDS` (`200`) iterations, comparing `f32(nextDouble)` against `f32(0.5)` for the ranged preference and returning `null` on a broken random source."
dfu: []
tags:
  - kings-gambit
  - board-generation
  - roster
  - army
  - determinism
---

`src/net/kingsGambit.js` builds symmetric `15x13` boards (`KG_COLS` by `KG_ROWS`), derives a 46-unit roster from `VANILLA_ENEMY_BASICS`, and deploys armies into rows `10..12` and `0..2`.

## Board Generation and Tiles

`buildMap` rolls up to `KG_MAP_TRIES` (`30`) layouts from `KG_LAYOUTS` (`pillared-hall`, `guard-rooms`, `ruined-keep`, and `moat-and-bridges`), placing obstacles and `KG_HAZARD_PAIRS_AT_START` (`3`) active hazard pairs in rows `KG_ZONE_TOP` (`3`) to `KG_ZONE_BOTTOM` (`9`) via mirrored `setTile`. `mapIsPlayable` requires `(7, 0)` reachable from `(7, 12)` and `97%` float32 floor connectivity, falling back to `KG_OPEN_FIELD`. In `KG_TILE` (`floor: 0`, `wall: 1`, `pillar: 2`, and `water: 3`), only `floor` is walkable and only `wall` and `pillar` satisfy `blocksSight`.

## Bestiary Roster, Budget, and Deployment

`KG_ROSTER` holds 46 male-textured `VANILLA_ENEMY_BASICS` entries (`src/characters/enemyBasics.js`), backed by `FOE_CARDS` (`src/cards/cardSources.js`). Monsters are melee at table level and mean HP; `KG_RANGED_CLASSES` (`128` Mage, `131` Sorcerer, `141` Archer, and `142` Ranger) are ranged at level `6` and `30` HP. In float32 (`makeUnit`), attack is `max(1, RoundToInt(level * KG_DAMAGE_PER_LEVEL * (ranged ? 0.75 : 1)))` (`KG_DAMAGE_PER_LEVEL` `2`) and cost is `max(KG_MIN_COST, RoundToInt(sqrt(hp * atk) * (ranged ? 1.35 : 1)))` (`KG_MIN_COST` `6`), sorted by cost, ordinal name, and ID. `KG_KINGS` sets the Knight (`145`) and Barbarian (`143`) to `KG_KING_LEVEL` (`8`), `KG_KING_HP` (`70`), attack `16`, and cost `0`.

`armyRefusal` enforces `KG_MAX_UNITS` (`12`) and `KG_POINT_BUDGET` (`300`). `autoFill` (`KG_AUTOFILL_ROUNDS` `200`) leans ranged (`KG_AUTOFILL_LEAN` `0.5`) below `KG_AUTOFILL_RANGED` (`2`), keeping the costlier draw. Deployment places the king at `(7, 12)` and fills units costliest-first center-out (`KG_CENTER_OUT`): melee in rows `11`, `10`, and `12`; ranged in `12`, `10`, and `11` (guest mirrored into `0..2`).
