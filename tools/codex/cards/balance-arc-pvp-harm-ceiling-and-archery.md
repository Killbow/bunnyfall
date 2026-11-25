---
slug: balance-arc-pvp-harm-ceiling-and-archery
title: "PvP Harm Ceiling and Archery Buffs"
domain: combat
kind: subcard
parent: balance-arc-overview
files:
  - src/net/siegeRef.js
  - src/net/arenaLaw.js
  - src/net/wire.js
  - src/characters/weapons.js
  - src/combat/formulas.js
  - src/magic/spellcast.js
  - src/combat/arrowFlight.js
replacesBible:
  - "05-Combat/Balance-Arc.md"
related:
  - balance-arc-overview
  - integrity-pvp-duel-and-wild-referees
  - arrow-flight-and-conjured-arrows
invariants:
  - "`SIEGE_HARM` (`{ max: SIEGE_CASTS.max * SIEGE_CASTS.damageMax, windowMs: 5000 }`, `180` damage per `5000` ms) caps combined melee, ranged, and spell damage in `refereeBlow` and `refereeCast` (`src/net/siegeRef.js`) via `min(want, perBlowMax, targetHp, harmRoom(by, now))`."
  - "`siegeBlowMax` evaluates `(SIEGE_WEAPON_MAX[top] + materialMod + SIEGE_BONUS_MAX) * SIEGE_CRIT_MAX` and never exceeds the attacker's signed weapon loadout."
  - "Refereed PvP rolls zero backstab damage against player targets."
  - "Short Bow deals `5-17` base damage and Long Bow deals `5-19` (`1` point above `FormulaHelper` maxima), with template IDs `129: 17` and `130: 19` pinned identically in `src/characters/weapons.js`, `SIEGE_WEAPON_MAX`, and `ARENA_WEAPON_MAX`."
  - "`ARROW_FLIGHT_SPEED` (`src/combat/arrowFlight.js`) equals `MISSILE_SPEED * 1.35` (`25.0 * 1.35`), whereas spell projectiles in `src/magic/spellcast.js` keep base `MISSILE_SPEED`."
traps:
  - "The gate arena (`src/net/arenaLaw.js`) does not use `SIEGE_HARM`; it enforces its own leaky bucket (`ARENA_BUCKET_RATE = 40` per second, `ARENA_BUCKET_DEPTH = 120`, and `ARENA_HIT_HZ_MAX = 4`)."
  - "Bow damage maxima must stay synchronized across `MAX_DAMAGE` (`src/characters/weapons.js`), `SIEGE_WEAPON_MAX` (`src/net/siegeRef.js`), and `ARENA_WEAPON_MAX` (`src/net/arenaLaw.js`) or referees will clip legitimate bow hits."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/DaggerfallMissile.cs
tags:
  - balance
  - pvp
  - referee
  - archery
  - bows
---

Refereed PvP bounds burst lethality across weapons and spells within a rolling five-second window, while ranged combat raises bow base damage and arrow velocity.

## Refereed PvP Harm Ceiling

In duel, siege, and Wild Zone combat (`src/net/siegeRef.js`), `SIEGE_HARM` limits each attacker to `180` total damage (`SIEGE_CASTS.max * SIEGE_CASTS.damageMax`, or `36` damage per second) across a rolling `5000` ms window. Both `refereeBlow` and `refereeCast` clamp every incoming claim to `Math.min(want, perBlowMax, targetHp, harmRoom(by, now))`. Single weapon hits cap at `siegeBlowMax = (SIEGE_WEAPON_MAX + materialMod + SIEGE_BONUS_MAX) * SIEGE_CRIT_MAX` bounded by the attacker's signed equipment, and referees suppress backstab multipliers against players (`src/combat/formulas.js`).

Gate arena matches (`src/net/arenaLaw.js`) use a separate token bucket (`ARENA_BUCKET_RATE = 40` per second, `ARENA_BUCKET_DEPTH = 120`, and `ARENA_HIT_HZ_MAX = 4`).

## Bow Damage and Arrow Speed

`src/characters/weapons.js` raises Short Bow (`129`) to `5-17` damage and Long Bow (`130`) to `5-19` (`+1` max damage over `FormulaHelper.cs`), mirrored in `SIEGE_WEAPON_MAX` and `ARENA_WEAPON_MAX`. In `src/combat/arrowFlight.js`, arrows fly at `ARROW_FLIGHT_SPEED = MISSILE_SPEED * 1.35` (`25.0 * 1.35`), while magic missiles (`src/magic/spellcast.js`) retain `MISSILE_SPEED`.
