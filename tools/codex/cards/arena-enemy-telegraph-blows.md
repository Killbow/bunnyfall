---
slug: arena-enemy-telegraph-blows
title: "Arena Enemy Telegraph Blows"
domain: combat
kind: subcard
parent: arena-ladder-telegraphs-and-trust-overview
files:
  - src/ai/blowShapes.js
  - src/ai/foeBlows.js
  - src/ai/tactics.js
  - src/net/arenaLaw.js
  - src/net/arenaBrain.js
  - src/scenes/exterior.js
  - src/scenes/dungeonContext.js
  - src/characters/exteriorFoes.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Arena-Ladder.md"
related:
  - arena-ladder-telegraphs-and-trust-overview
  - arena-ladder-tickets-and-judges
invariants:
  - "Blow shapes live in leaf `src/ai/blowShapes.js` (`BLOW_FAMILY`, `BLOW_CASTERS`, `blowShapesOf`, `inBlow`) so the relay need not import `mobileTypes.js`."
  - "Casters (`BLOW_CASTERS`) never telegraph."
traps:
  - "The verdict is keyed to the target via `_blowFor`; a target change before the damage frame resolves the swing unweighed."
dfu: []
tags:
  - telegraph
  - blow
  - relay
  - enemies
---

# Arena Enemy Telegraph Blows

`src/ai/blowShapes.js`, `src/ai/foeBlows.js`, and `src/net/arenaBrain.js` drive telegraphed heavy strikes for arena and exterior enemies across `src/scenes/exterior.js`, `src/scenes/dungeonContext.js`, and `src/characters/exteriorFoes.js`. Because `src/ai/blowShapes.js` is a standalone leaf module exporting `BLOW_FAMILY`, `BLOW_CASTERS`, `blowShapesOf`, and `inBlow`, the relay server evaluates telegraph geometry without importing `mobileTypes.js`.

## Telegraph Roll, Sand Rendering, and Judge Miss Accounting

- **Eligibility, speed, and targeting (`src/net/arenaLaw.js`, `src/net/arenaBrain.js`, `src/ai/tactics.js`):** Spellcasters listed in `BLOW_CASTERS` never telegraph. On the relay, non-caster enemies at or above `ARENA_BLOW_TIER_LEVEL = 10`, along with all elite champions, roll `ARENA_BLOW_CHANCE = 0.35` to initiate a telegraphed blow. Arena combatants move at `ARENA_CLASS_SPEED = 5.0` for class fighters and `ARENA_BEAST_SPEED = 6.0` for beasts. During Grand Melee bouts, `attackerOfMe` prioritizes the active striker before checking proximity.
- **Sand markers and dodge verdicts (`src/ai/foeBlows.js`, `src/arena/arenaBouts.js`):** `src/ai/foeBlows.js` draws ground telegraph shapes within `SAND_DRAW_RANGE = 100`. Each telegraphed swing records its intended victim in `_blowFor`; if the enemy switches targets before the damage frame lands, the strike resolves as a normal unweighed swing. When the targeted fighter steps clear of `inBlow` before impact, the evade notifies `arenaBouts.blowDodged` through `registerBlowDodgedListener` and registers as a miss on the scorecard of the judges.
