---
slug: revenant-unquiet-crafts-ambitions-and-dread
title: "Unquiet Flight Crafts, Ambitions, and the Dread"
domain: ai
kind: subcard
parent: revenants-lifecycle-overview
files:
  - src/revenants/revenantUnquiet.js
  - src/revenants/revenant.js
  - src/revenants/revenantFeud.js
  - src/render/dissolve.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Revenants.md"
related:
  - revenants-lifecycle-overview
  - revenant-feuds-adaptations-and-fate
  - revenant-lairs-thefts-and-companions
invariants:
  - "Flight crafts (`CRAFTS`: `smoke`, `blink`, `sink`, and `bolt`) unlock at `CRAFT.RANK` (`2`) and run on the enemy pool clock."
  - "Ambition derives from personality via `ambitionOf` (unknown personalities fall back to `vengeance`) and is never persisted."
  - "`mayAscend` requires a living, non-Dread record at rank `>= REVENANT_MAX_RANK` (`5`) with a lair while fewer than `DREAD.MAX` (`1`) Dreads live; choice slips never ascend."
traps:
  - "Striking a revenant during a `sink` escape breaks the sink, forcing the revenant to rise `cornered` and preventing another flight attempt that fight."
  - "`hoardOf` takes the larger of `DREAD.GOLD` (`3`) and a plunderer's `plunderGold` multiplier rather than multiplying the two together."
dfu: []
tags:
  - revenants
  - unquiet
  - flight
  - ambition
  - dread
---

From rank 2 onward, `src/revenants/revenantUnquiet.js` governs escape crafts, personality-driven ambitions, combat wounds, and rank-5 ascension into the Dread.

## Flight Crafts, Trails, and Wounds

At `CRAFT.RANK` (`2`), fleeing revenants replace basic `REVENANT_FLEE_PACE` (`2`) flight with kind-specific `CRAFTS` (`src/revenants/revenant.js` and `src/render/dissolve.js`):
- **Persons (`smoke`):** Cast Chameleon for `CRAFT.SMOKE_ROUNDS` (`2`).
- **Casters, spirits, liches, nymphs, shamans, daedra, and atronachs (`blink`):** Move at `CRAFT.BLINK_PACE` (`0.5`) with an arcane violet dissolve (`CRAFT_TINT`, `CRAFT.BLINK_DELAY = 0.8` s, `CRAFT.BLINK_MS = 600`).
- **Undead (`sink`):** Move at `CRAFT.SINK_PACE` (`0.05`) with an earth-tinted sink (`CRAFT.SINK_DELAY = 200` ms, `CRAFT.SINK_MS = 1400`); any hit breaks it and leaves the enemy `cornered`.
- **All others (`bolt`):** Sprint at `CRAFT.BOLT_PACE` (`2.5`).

Open-world escapes start a lair trail for `HUNT.MINUTES` (`720`) at `HUNT.HEALTH` (`0.6`). Defeats can inflict up to `WOUND.MAX` (`3`) wounds (`WOUND.RESIST = -15`, healing every `WOUND.HEAL_DAYS = 5` days), while `TEAR_RANK` (`2`) and `BLOOD_RANK` (`2`) pace rank-ups (`src/revenants/revenantFeud.js`).

## Ambitions and the Dread

`ambitionOf` maps `AMBITION_OF` without saving state:
- **Vengeance (`brutal`, `zealous`, and `unhinged`):** Returns in `AMBITION.VENGEANCE_DUE` (`[1440, 2880]` min) at `AMBITION.VENGEANCE_RETURN` (`0.55`).
- **Mastery (`'honourable'`, `arrogant`, and `cold`):** Festers on `AMBITION.FESTER_DAYS` (`2`) and `AMBITION.FESTER_EVERY` (`2`) instead of general `FESTER` (`3` and `3`).
- **Plunder (`witty`, `humorous`, `craven`, and `weary`):** Scales hoard gold by `1 + AMBITION.PLUNDER_PER_DAY` (`0.25`) per whole day overdue up to `AMBITION.PLUNDER_MOST` (`3`).

When a rank-5 revenant with a lair escapes (`mayAscend`, excluding choice slips) below `DREAD.MAX` (`1`), it ascends to the Dread (`DREAD.HEALTH = 1.5`, `DREAD.STANDS = 2`, `DREAD.SECOND_STAND = 0.25`, and `DREAD.GOLD = 3`).
