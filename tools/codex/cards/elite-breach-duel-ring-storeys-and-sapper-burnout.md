---
slug: elite-breach-duel-ring-storeys-and-sapper-burnout
title: "Elite Breach Duel Ring, Storey Separation, Ward Bar, and Sapper Burnout"
domain: multiplayer
kind: subcard
parent: craft-how-hitch-counter-home-stations-and-slowfall-leap-overview
files:
  - src/systems/eliteGates/egFight.js
  - src/systems/eliteGates/egClient.js
  - src/net/eliteGates/egLords.js
  - src/net/eliteGates/egBodies.js
  - src/net/eliteGates/egWalkGraph.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egRun.js
  - src/net/eliteGates/egLink.js
  - src/net/gateBrain.js
  - src/ui/eliteGates/egSpireHud.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-18d.md"
related:
  - craft-how-hitch-counter-home-stations-and-slowfall-leap-overview
  - elite-breach-spire-overview
  - elite-breach-ascent-route-graph-and-storeys
  - elite-breach-spire-client-rules-and-telegraphs
  - elite-breach-lord-fall-overview
invariants:
  - "Armsmaster challenges set `F.pg.ring = [cx, cz, 6]` (`duelRing` in `src/systems/eliteGates/egFight.js`) and clear `pg.ring` at challenge end, whereas solo fighters receive `EG_DUEL_OPEN` (`'open'`, deal `10%` health within `15` s with no ring) and emit `eg.say.duelUnmet` only when `ch.r <= 0`."
  - "Bodies separated vertically by `EG_STACK_M` or more stand on distinct storeys (`egOneStorey`): melee never crosses storeys, while ranged shafts and spells fail only when vertically stacked in the same column (`egStacked` in `src/net/eliteGates/egWalkGraph.js`)."
  - "Lord HUD bars display ward from `EG_FL.ward` (`egSpireHud.js`, active on Conquest while `banners.length >= 2 && now < C.wardUntil`), Spire speech retains `EG_SAYS_KEPT = 12` lines (`egLink.js`), and `winchPlates` draws plates at `EG_TOUCH_M = 2.5` m."
  - "`sapperReach` heals the lord only while `L.hp > 0 && (F.mem.fed ?? 0) < SAP_FEEDS_MAX`; beyond that cap the Sapper crumbles (`EG_GONE.crumbled`) without healing, and Rest opens `EG_RD_WINDOW_MS = 6000` ms after boss death (`EG_ASK_MS = 30_000`, `EG_TWIN_ONE_MS = 20_000`)."
traps:
  - "`egFight.js` and `egClient.js` reside under `src/systems/eliteGates/`, and `egClient.js` binds raw `KeyY`/`KeyN` votes and `Digit1`-`Digit6` Rest picks."
dfu: []
tags:
  - elite-gates
  - spire
  - duel
  - storeys
  - ward
  - sapper
  - winch
---

# Elite Breach Duel Ring, Storey Separation, Ward Bar, and Sapper Burnout

Spire combat rules for Armsmaster duel rings, vertical storey separation, Conquest ward bars, and Sapper feeding caps span `src/systems/eliteGates/egFight.js`, `src/systems/eliteGates/egClient.js`, `src/net/eliteGates/egLords.js`, `src/net/eliteGates/egBodies.js`, `src/net/eliteGates/egWalkGraph.js`, `src/net/eliteGates/egBrain.js`, `src/net/eliteGates/egRun.js`, `src/net/eliteGates/egLink.js`, `src/net/gateBrain.js`, and `src/ui/eliteGates/egSpireHud.js`.

## Armsmaster Duel Ring and Storey Combat Rules

- **Duel ring versus solo open challenge:** Armsmaster challenges set `F.pg.ring = [cx, cz, 6]` (`duelRing` in `src/systems/eliteGates/egFight.js`) and clear `pg.ring` when the challenge ends. Solo fighters receive `EG_DUEL_OPEN` (`'open'`, requiring `10%` health damage within `15` s without a ring) and emit `eg.say.duelUnmet` only when `ch.r <= 0`.
- **Storey separation (`EG_STACK_M`):** Combatants separated vertically by `EG_STACK_M` or more stand on distinct storeys (`egOneStorey` in `src/net/eliteGates/egBodies.js` and `src/net/eliteGates/egWalkGraph.js`). Melee never crosses storeys, whereas ranged shafts and spells fail only when targets are vertically stacked in the same column (`egStacked`).

## Ward HUD, Winch Plates, Sapper Cap, and Rest Timers

Lord HUD bars display `EG_FL.ward` (`src/ui/eliteGates/egSpireHud.js`, active on Conquest while `banners.length >= 2 && now < C.wardUntil`), `src/net/eliteGates/egLink.js` retains `EG_SAYS_KEPT = 12` speech lines, and `winchPlates` draws plates at `EG_TOUCH_M = 2.5` m. In `src/net/eliteGates/egLords.js`, `sapperReach` heals the lord only while `L.hp > 0 && (F.mem.fed ?? 0) < SAP_FEEDS_MAX` (`src/net/gateBrain.js`), crumbling (`EG_GONE.crumbled`) without healing past that cap. Rest opens `EG_RD_WINDOW_MS = 6000` ms after boss defeat (`EG_ASK_MS = 30_000`, `EG_TWIN_ONE_MS = 20_000`), with `src/systems/eliteGates/egClient.js` binding raw `KeyY`/`KeyN` votes and `Digit1`-`Digit6` Rest picks.
