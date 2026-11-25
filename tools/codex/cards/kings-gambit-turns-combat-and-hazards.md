---
slug: kings-gambit-turns-combat-and-hazards
title: "King's Gambit Turns, Combat Rolls, Line of Sight, and Hazard Cycle"
domain: multiplayer
kind: subcard
parent: kings-gambit-overview
files:
  - src/net/kingsGambit.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Kings-Gambit.md"
related:
  - kings-gambit-overview
  - kings-gambit-board-roster-and-armies
  - kings-gambit-tavern-regulars-and-purses
invariants:
  - "Each turn grants `KG_ACTIONS_PER_TURN` (`2`) actions from `KG_COMMANDS` (`move`, `attack`, `potion`, and `end`, where `end` forfeits remaining actions); spending the last action marks the state `ending` until `finishTurn` runs."
  - "Movement searches breadth-first over unoccupied `floor` cells up to `KG_MOVE_RANGE` (`3`) orthogonal steps and never passes through another piece (`reachable` and `reachPath`)."
  - "Attacks target enemy pieces at Manhattan distance `1` through `rangeOf` (melee `1`, ranged `KG_RANGED_RANGE` `4`); beyond distance `1`, `hasLineOfSight` steps `KG_SIGHT_SAMPLES` (`4`) samples per cell along the longer axis rounded via `roundDiv`, excluding both endpoints."
  - "`blowRoll` draws one `nextDouble` `u` per attack and deals `max(1, RoundToInt(atk * (KG_BLOW_LOW + KG_BLOW_SPREAD * u)))` in float32 (`KG_BLOW_LOW` `0.8`, `KG_BLOW_SPREAD` `0.4`)."
  - "`checkOver` runs after every attack and hazard tick; a side loses when its king dies or it has no pieces left, checking the guest first."
traps:
  - "Hazards damage only the active side at `finishTurn` and only when the piece sits on an `active` hazard; walking across a hazard tile during movement deals no damage."
  - "Potions (`KG_POTIONS_PER_SIDE` `3`, healing `KG_POTION_HEAL` `30`) return `'full'` on an uninjured piece and `'potions'` when the side's supply is spent."
  - "The rules engine enforces no maximum round cap and no automatic draw rule."
dfu: []
tags:
  - kings-gambit
  - combat
  - turns
  - hazards
  - line-of-sight
---

Turn execution, line-of-sight sampling, combat damage, and the two-round hazard cycle run deterministically inside `src/net/kingsGambit.js`.

## Turn Actions, Movement, and Combat

A side takes up to `KG_ACTIONS_PER_TURN` (`2`) commands (`KG_COMMANDS`: `move`, `attack`, `potion`, or `end`). `gambitRefusal` returns `over`, `side`, `shape`, `ending`, `turn`, `piece`, `cell`, `target`, `range`, `full`, or `potions`, and `gambitAct` adds `rand` on a broken random source. When actions reach zero or on `end`, the state becomes `ending` until `finishTurn`.

- **Movement (`move`):** `reachable` and `reachPath` search breadth-first up to `KG_MOVE_RANGE` (`3`) steps over empty `floor` tiles without passing through any piece.
- **Attacks (`attack`):** Legal at Manhattan distance `1..rangeOf` (melee `1`, ranged `KG_RANGED_RANGE` `4`). Distance `2..4` requires `hasLineOfSight` (`KG_SIGHT_SAMPLES` `4` samples per tile along the major axis, rounded by `roundDiv`, endpoints excluded) and emits `shot` on the `attack` event. `blowRoll` draws one `nextDouble` `u` in float32: `max(1, RoundToInt(atk * (KG_BLOW_LOW + KG_BLOW_SPREAD * u)))` (`KG_BLOW_LOW` `0.8`, `KG_BLOW_SPREAD` `0.4`).
- **Potions (`potion`):** Each side has `KG_POTIONS_PER_SIDE` (`3`) potions healing `KG_POTION_HEAL` (`30`) HP up to max HP.

## Hazard Cycle and Victory Check

`finishTurn` applies `KG_HAZARD_KINDS` (`fire`, `spikes`, and `poison` dealing `KG_HAZARD_DAMAGE` `8`, `6`, and `5`) to pieces of the ending side standing on `active` hazards. The round increments after the guest finishes; every `KG_HAZARD_SPAWN_EVERY` (`2`) rounds (`warningsArmAt(round)`), warnings arm (`armed` event) and a new mirrored warning pair spawns (up to `KG_MAX_HAZARDS` `14` across `KG_HAZARD_TRIES` `40` tries, `warning` event). `checkOver` runs after every attack and hazard tick, checking the guest before the host.
