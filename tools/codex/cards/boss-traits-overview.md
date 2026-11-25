---
slug: boss-traits-overview
title: "Boss Traits: Readable Rules on Hard Enemies"
domain: combat
kind: overview
parent: null
files:
  - src/characters/bossTraits.js
  - src/characters/foeTraitsHost.js
  - src/characters/foeTitle.js
  - src/characters/eliteFoes.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Boss-Traits.md"
related:
  - boss-traits-striker-and-owner-halves
  - boss-traits-carriers-wire-and-hud
  - combat-formulas-and-power-ceiling
  - balance-arc-place-threat-elites-and-death
invariants:
  - "BOSS_TRAITS bit order is append-only because the mask goes over the wire."
  - "bladeturning and stoneskin never stand together: rollBossTraits removes the partner from the pool, and bossTraitsOfMask drops the later bit."
  - "Whole kills (whole=true) are not blows, and no trait touches them."
  - "The trait clock is game time: tickBossClock adds at most 1 s per call and nothing while paused, so a pause holds ward regrowth and the wrath timer."
traps:
  - "Boss traits are not DFU career resistances. FormulaHelper.SavingThrow flags still apply alongside them."
  - "The ward is WARD_SHARE of maxHealth as it stands when read (wardMax), not a value fixed at spawn."
dfu: []
tags:
  - boss-traits
  - elites
  - combat
  - difficulty
---

# Boss Traits: Readable Rules on Hard Enemies

Boss traits place readable combat defenses, wards, damage caps, and enrage timers directly on tough enemies instead of stripping abilities from the player.

- **Trait Roster and Mutual Exclusion (`src/characters/bossTraits.js`, `src/characters/eliteFoes.js`):** `BOSS_TRAITS` defines 11 append-only bitmask entries (`BOSS_TRAIT_MASK_MAX = (1 << 11) - 1`): `warded`, `flameproof`, `frostproof`, `venomproof`, `stormproof`, `spellproof`, `bladeturning`, `stoneskin`, `curbing`, `wrathful`, and `thorned`. `bladeturning` and `stoneskin` never pair together; `rollBossTraits` removes the partner from the draw pool, and `bossTraitsOfMask` drops the later bit.
- **Core Constants and Clock (`src/characters/bossTraits.js`, `src/characters/foeTraitsHost.js`):** Trait math uses `WARD_SHARE` (`0.3` of current `maxHealth` via `wardMax`), `WARD_REGROW_S` (`10`), `WARD_REFILL_S` (`4`), `RESIST_SHARE` (`0.25`), `WEAPON_RESIST_SHARE` (`0.5`), `CURB_SHARE` (`0.05`), `WRATH_AFTER_S` (`75`), `WRATH_X` (`1.6`), `WRATH_COOL_S` (`30`), and `THORN_SHARE` (`0.2`). `tickBossClock` advances in game time by at most `1` s per call and pauses when the game is paused. Whole kills (`whole=true`) bypass all traits, while DFU `FormulaHelper.SavingThrow` flags still apply alongside boss traits.
- **Titles and Session Teaching (`src/characters/foeTitle.js`, `src/characters/foeTraitsHost.js`):** `bossTitle` prepends the leading trait name through the `bossTraits.title` localization key (such as `'Warded Elite Orc'`), and `bossTraitsTaught` announces each trait rule once per session on the first player blow against a carrier.
