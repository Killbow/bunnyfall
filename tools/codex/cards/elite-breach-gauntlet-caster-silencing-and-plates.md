---
slug: elite-breach-gauntlet-caster-silencing-and-plates
title: "Elite Breach Rampart Gauntlet: Caster Silencing, Plate Hold, and HUD Marks"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egBodies.js
  - src/net/eliteGates/egLaw.js
  - src/ui/eliteGates/egHud.js
  - src/systems/eliteGates/egFight.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19d.md"
related:
  - elite-breach-clock-and-hall-rhythm
  - elite-breach-broken-way-and-trial-await
  - elite-breach-landed-word-damage-numbers
invariants:
  - "At Rampart Gauntlet wake (`P.obj = 'gauntlet'`), `k = min(pillars.length, 2 + ceil(n / 2))` pillars from `spec.spots.pillar` each spawn one pinned Caster stored in `g.i`, and `F.pg.left` opens the Gauntlet door when it reaches `0`."
  - "Each beat in `trialStep` (`src/net/eliteGates/egBrain.js`), a pillar with `g.i` set whose body is absent from `egBodyById(F, g.i)` (slain via `addDied`) marks `g.done = 1` and emits `esay` `'silenced'` before checking plates."
  - "Standing unbroken within `EG_TOUCH_M` (`2.5` m) of `g.p.plate` for `EG_SILENCE_MS` (`3000` ms) silences a living Caster via `egGone` (`EG_GONE.crumbled`), while pillars without `g.i` still require plate holding."
  - "`F.pg.silenced` broadcasts per-plate completion in `spots.pillar` order so `gauntletPlates` (`src/systems/eliteGates/egFight.js`) dims finished plates and `src/ui/eliteGates/egHud.js` renders `Casters left: {n}. Hold a plate {s} s or slay its caster`."
traps:
  - "Gauntlet progression executes on the relay (`egBrain.js`); changing silencing rules requires bumping `RELAY_VERSION` and deploying the relay before web clients."
dfu: []
tags:
  - elite-breach
  - gauntlet
  - rampart
  - relay
  - hud
---

# Elite Breach Rampart Gauntlet: Caster Silencing, Plate Hold, and HUD Marks

Rampart Gauntlet (`P.obj = 'gauntlet'`, objective text `EG_OBJECTIVES.gauntlet` = `Silence the casters.` in `src/net/eliteGates/egLaw.js`) runs across `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egBodies.js`, `src/systems/eliteGates/egFight.js`, and `src/ui/eliteGates/egHud.js`.

- **Pillar spawn and remaining count:** At wake, `k = min(pillars.length, 2 + ceil(n / 2))` pillars from `spec.spots.pillar` each spawn one pinned Caster whose body identifier is recorded in `g.i`. The hall exit door opens when `F.pg.left` reaches `0`.
- **Slaying or plate holding:** Each beat in `trialStep` (`src/net/eliteGates/egBrain.js`), any pillar with `g.i` set whose body is absent from `egBodyById(F, g.i)` after `addDied` in `src/net/eliteGates/egBodies.js` marks `g.done = 1` and emits `esay` `'silenced'` before evaluating plate timers. Alternatively, standing unbroken within `EG_TOUCH_M` (`2.5` m) of `g.p.plate` for `EG_SILENCE_MS` (`3000` ms) removes a living Caster via `egGone` (`EG_GONE.crumbled`). Pillars without `g.i` still require plate holding.
- **Plate visuals and HUD prompt:** `F.pg.silenced` broadcasts completion in `spots.pillar` order so `gauntletPlates` in `src/systems/eliteGates/egFight.js` dims finished plates and `src/ui/eliteGates/egHud.js` displays `Casters left: {n}. Hold a plate {s} s or slay its caster`.
