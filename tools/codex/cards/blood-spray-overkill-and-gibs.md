---
slug: blood-spray-overkill-and-gibs
title: "Rate Ladder, Spray, Overkill Burst, and Gibs"
domain: combat
kind: subcard
parent: blood-marks-overview
files:
  - src/combat/bloodDecals.js
  - src/combat/bloodGibs.js
  - src/combat/bloodMarks.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Blood-Arc.md"
related:
  - blood-marks-overview
  - blood-atlas-drying-and-wet-film
  - combat-formulas-and-power-ceiling
invariants:
  - "`ladderRate` returns `RATE_MAX` (`200`) at `percent >= OVERKILL_PERCENT` (`175`). The overkill line and the ladder top rung are one constant."
  - "`scaleRate = max(1, round(rate * density))`, so a hit always leaves at least one mark."
  - "The overkill branch is either/or: `450` for a player warhammer (template `126`), otherwise `350`. The burst sprays in addition to the ordinary ladder spray, never instead of it."
  - "Only the heavy branch throws gibs, capped at `GIB_COUNT * MAX_BODIES` live chunks."
traps:
  - "The reference `1..5` vs `5..10` figures are particle speeds, which set reach (`OVERKILL_REACH_SCALE = 7.5/3`), not mark size."
  - "`swingThrow` drops the vertical push, so `StrikeDown` throws nothing sideways. Its lookup uses `Object.hasOwn` because a prototype key once produced `NaN`."
  - "Arrow and missile blood does not read the live swing state."
dfu:
  - "Assets/Scripts/Game/WeaponManager.cs"
  - "Assets/Scripts/Game/EnemyBlood.cs"
tags:
  - blood
  - overkill
  - gibs
  - spatter
  - warhammer
---

`src/combat/bloodDecals.js`, `src/combat/bloodMarks.js`, and `src/combat/bloodGibs.js` map hit damage to particle rates, droplet arcs, wall runs, overkill bursts, and warhammer gibs.

## Rate Ladder and Spray Geometry

`ladderRate` maps `percent = damage/maxHealth*100` via `RATE_LADDER`: `<=25`->`30`, `<=50`->`50`, `<=100`->`70`, `<175`->`RATE_NEAR_LETHAL` (`150`), and `>=OVERKILL_PERCENT` (`175`)->`RATE_MAX` (`200`). `scaleRate = max(1, round(rate*density))`, and `sprayCount` clamps `round(rate*SPRAY_SHARE)` (`0.12`) to `1..SPRAY_MAX` (`24`).

Drop `0` is the pool at full `markSize` (`MARK_SIZE_MIN = 0.35`..`MARK_SIZE_MAX = 1.2`). Other drops use `SPATTER_SCALE` (`0.45`) with `SIZE_JITTER` (`0.3`) across up to three lobes in `sprayPattern`. `swingThrow` reads `SWING_PUSH` via `Object.hasOwn` and drops vertical push (`StrikeDown` throws nothing sideways); arrows ignore swing state.

## Ballistics, Overkill, and Gibs

Drops fly via `dropArc`/`dropAt` up to `MAX_FLYING` (`256`), hitting via `collider.surfaceHit`. One drop in four checks ceilings (`CEILING_DOT = 0.7`, `CEILING_REACH = 4`, `MARK_DROP = 3`). Wall runs lean up to `WALL_RUN_LEAN` (`0.12` rad), and grazing hits stretch by `streakFor` and `impactStretch = hypot(h,v)/v` up to `STREAK_MAX` (`2.5`).

At `percent >= 175`, `place()` adds an extra burst (`burstCount` up to `BURST_DROPS_MAX = 48`, reach `OVERKILL_REACH_SCALE = 7.5/3`). A player hit with `HEAVY_WEAPON_TEMPLATE` (`126`, warhammer) uses `OVERKILL_RATE_HEAVY` (`450`) and throws `GIB_COUNT` (`10`) gibs (`GIB_QUAD` `0.28`, `GIB_THROW_SIDE = 15`, `GIB_THROW_UP = 5..15`, `GIB_GRAVITY_SCALE = 3`, `GIB_DRAG = 0.1`, `GIB_LIFE = 4` s, cap `GIB_COUNT*MAX_BODIES`), landing with a `20`-rate splash at speed `2..4`. Other overkills use `OVERKILL_RATE` (`350`) without gibs.
