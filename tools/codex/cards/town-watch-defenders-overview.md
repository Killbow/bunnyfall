---
slug: "town-watch-defenders-overview"
title: "Town Watch Defenders: Summon Countdown, Walk-Off, and popAllowChange"
domain: "npc-ai"
kind: "overview"
parent: null
files:
  - "src/characters/cityGuards.js"
  - "src/characters/townPopulation.js"
  - "src/systems/livingWorld/livingTown.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12e.md"
related:
  - "town-watch-defenders-recall-and-enlist"
  - "living-world-census-schedules-and-watch"
  - "raiding-parties-kinds-and-held-towns"
  - "npc-populations-wardrobe-and-creatures"
invariants:
  - "Stood-down town defenders (`dismissDefenders` setting `g.leaving = true`) walk away in `DEFENDER_LEAVE_LEG_SECONDS = 3` s `flee` legs and despawn only when `popAllowChange(dx, dz, viewYaw, dist)` in `src/characters/townPopulation.js` permits (`dist > POP_VISIBLE_RANGE` at `120` m or behind `viewYaw`)."
  - "`defenderCount` excludes dead, leaving, and raid Standard-Bearer guards while counting active defenders, pending mints, and `5` to `10` s summon countdowns."
  - "Street walkers, `livingTown._hidden`, and city guards share `popAllowChange`, and a despawned leaving defender sets `g.dead` and releases its batch without spawning a corpse."
traps:
  - "City guards use enemy mobile bodies (`mobileType = 146`, texture `399`) placed within `GUARD_NPC_SPAWN_RANGE = 77.5` m or `SPAWNER_ARMS.cityGuards` (`placeFoeFreely`), not civilian NPC walkers."
  - "When `viewYaw()` is absent or non-finite, `popAllowChange` falls back to `dist > POP_VISIBLE_RANGE` alone, and a leaving defender attacked by a live non-player target pauses fleeing (`fleeLeft = 0`) to fight before resuming."
dfu: []
tags:
  - "city-guards"
  - "town-watch"
  - "defenders"
  - "despawn"
---

# Town Watch Defenders: Summon Countdown, Walk-Off, and popAllowChange

Town watch defenders summoned against threats in `src/characters/cityGuards.js` walk off after combat instead of vanishing in front of the player, sharing camera-cone despawn visibility with `src/characters/townPopulation.js` and `src/systems/livingWorld/livingTown.js`.

- **Summon accounting and enemy mobile bodies:** `createCityGuards` exports `summonDefenders`, `standDefender`, `dismissDefenders`, and `defenderCount`, receiving `viewYaw: () => cam.yaw` from `src/scenes/world.js`. City guards spawn as enemy mobile bodies (`mobileType = 146`, texture `399`) within `GUARD_NPC_SPAWN_RANGE = 77.5` m or via `SPAWNER_ARMS.cityGuards` (`placeFoeFreely`) rather than as civilian walkers. `defenderCount` counts active defenders, pending mints, and `5` to `10` s summon countdowns while excluding dead guards, `leaving` guards, and raid Standard-Bearers.
- **Walk-off legs and `popAllowChange` despawning:** When threats clear, `dismissDefenders` sets `g.leaving = true`, driving the defender away in `DEFENDER_LEAVE_LEG_SECONDS = 3` s `flee` legs. If a live non-player attacker hits a departing defender, the guard pauses fleeing (`fleeLeft = 0`) to fight back before resuming its walk-off. Street walkers, `livingTown._hidden`, and departing defenders share `popAllowChange(dx, dz, viewYaw, dist)`, which allows despawning only behind `viewYaw` or past `dist > POP_VISIBLE_RANGE` (`120` m, the sole check when `viewYaw()` is non-finite), setting `g.dead` and releasing the batch without a corpse.
