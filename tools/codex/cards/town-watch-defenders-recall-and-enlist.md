---
slug: "town-watch-defenders-recall-and-enlist"
title: "Recalling and Enlisting Walking Town Watch Defenders"
domain: "npc-ai"
kind: "subcard"
parent: "town-watch-defenders-overview"
files:
  - "src/characters/cityGuards.js"
  - "src/worldEvents/raidingParties.js"
  - "src/systems/livingWorld/livingWatch.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12e.md"
related:
  - "town-watch-defenders-overview"
  - "raiding-parties-kinds-and-held-towns"
  - "living-world-census-schedules-and-watch"
invariants:
  - "`summonDefenders` (`src/characters/cityGuards.js`) calls `recallDefender` on every living guard with `g.leaving === true`, routing them toward the nearest threat and restoring them to `defenderCount` before spawning new defenders."
  - "`standDefender` (invoked by town raids in `src/worldEvents/raidingParties.js`) reuses a walking-off defender before minting a fresh body."
  - "`enlistDefender` clears `leaving` and `fleeLeft` when a crime occurs so a departing defender turns hostile against the player."
traps:
  - "Regular crime-watch guards clear immediately when player crime clears; only stood-down town defenders use the `leaving` walk-off lifecycle."
  - "`src/systems/livingWorld/livingWatch.js` keeps a converted watch resident lent out until the guard body fully despawns or dies."
dfu: []
tags:
  - "city-guards"
  - "raids"
  - "living-watch"
  - "crime"
---

# Recalling and Enlisting Walking Town Watch Defenders

While stood-down town defenders are walking off under `g.leaving === true`, `src/characters/cityGuards.js` can recall them into renewed town defense, reuse them for raid waves (`src/worldEvents/raidingParties.js`), or enlist them into crime pursuit while preserving `src/systems/livingWorld/livingWatch.js` resident loans.

- **Target clearing during walk-off:** A leaving defender who is not actively beset clears its selected target reference so the guard walks away cleanly without swinging at empty air.
- **Recalling for threats and raids:** Before queueing or minting new guards, `summonDefenders` runs `recallDefender` across every living guard with `g.leaving === true`, clearing the walk-off state, routing the guard toward the nearest hostile threat, and restoring the unit to `defenderCount`. Similarly, when a town raid stages defenders via `standDefender` (`src/worldEvents/raidingParties.js`), `cityGuards.js` reclaims an already-walking `leaving` defender before spawning a fresh mobile body.
- **Crime enlistment and living-watch loans:** When a player commits a crime, `enlistDefender` clears `leaving` and `fleeLeft` so a departing defender turns hostile against the player; unlike town defenders, ordinary crime-watch guards still clear immediately when player crime clears. Throughout the `leaving` walk-off and any recall, `src/systems/livingWorld/livingWatch.js` keeps a converted watch resident lent out until the guard body finally despawns or dies.
