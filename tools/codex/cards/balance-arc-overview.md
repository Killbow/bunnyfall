---
slug: balance-arc-overview
title: "Balance Arc: Symmetric Strikes, Wear Edge, and Swing Timing"
domain: combat
kind: overview
parent: null
files:
  - src/combat/pcaao.js
  - src/combat/formulas.js
  - src/characters/entityMods.js
  - src/characters/weaponStates.js
  - src/combat/swingLaw.js
  - src/combat/combatStats.js
  - src/characters/playerEntity.js
replacesBible:
  - "05-Combat/Balance-Arc.md"
related:
  - combat-formulas-and-power-ceiling
  - balance-arc-place-threat-elites-and-death
  - balance-arc-reflection-leech-and-arcane-caps
  - balance-arc-lycanthropy-and-vampirism
  - vampire-vitae-blood-and-feeding
  - balance-arc-pvp-harm-ceiling-and-archery
invariants:
  - "Every attacker (player or enemy) computes `chanceToHitMod = Math.ceil(skill * 1.5)` in `pcaaoAttackDamage` and rolls critical hits through `pcaaoCriticalStrike` as `crit / (4 - Math.floor((luck - 50) / 25))`."
  - "`pcaaoArmorToHit` preserves asymmetric armor evaluation: a player uses `100` minus armor modifiers and points, a class enemy uses a flat `60`, and a monster uses its struck body-part value."
  - "`pcaaoAlterDamageBasedOnWepCondition` bonus bands at `76%+` condition (blade `1.3x` and `1.1x`, blunt `1.1x`) apply only when `sharpEdge` (the gear wear option) is active; `pcaaoAlterArmorReducBasedOnItemCondition` checks the same switch."
  - "Human bare-fist attacks (outside beast form) apply `weaponBlowMods(null, ...)` in both `handToHandAttackDamage` and `pcaaoHandToHandAttackDamage`."
  - "Any weapon flagged `shortBlade` uses `SWING_SHORT_BLADE = SWING_HANDLING[4]` (`0.9`, the Dagger row) in `swingHandling`."
traps:
  - "One-shot protection in `src/characters/playerEntity.js` prevents a single enemy blow from reducing a full-health player below `1` HP, but falls, poison ticks, spells, traps, and world-boss strikes bypass that guard and can still kill outright."
  - "Wear bands below `76%` condition (damaged-gear penalties) apply regardless of `sharpEdge`; only the `76%+` bonus bands require `sharpEdge`."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/WeaponManager.cs
tags:
  - balance
  - combat
  - hit-chance
  - critical-strike
  - weapon-condition
  - short-blade
---

The Balance Arc unifies player and enemy strike math in `src/combat/pcaao.js`, gates pristine-condition gear bonuses behind the wear toggle, routes bare-fist attacks through weapon blow modifiers, and speeds up short-blade swings. For base `FormulaHelper` rolls and composite power caps (`43.18x` damage ceiling and `10.71%` minimum damage taken), see `combat-formulas-and-power-ceiling`.

## Symmetric Strike and Critical Rolls

In `pcaaoAttackDamage` (`src/combat/pcaao.js`), both player and enemy attackers derive `chanceToHitMod = Math.ceil(skill * 1.5)` and roll critical hits via `pcaaoCriticalStrike` using `crit / (4 - Math.floor((luck - 50) / 25))`. Landing a critical hit scales damage by `critDamMulti = 1 + Math.trunc(crit / 5) * 0.05` and adds `critHitAddi = Math.trunc(crit / 4)`. Target armor resolution in `pcaaoArmorToHit` stays asymmetric: players subtract armor modifiers and points from `100`, class enemies use a flat `60`, and monsters read their body-part armor table.

## Condition Bonuses, Bare Fists, and Short Blades

`pcaaoAlterDamageBasedOnWepCondition` and `pcaaoAlterArmorReducBasedOnItemCondition` apply `76%+` condition bonuses (blade `1.3x` and `1.1x`, blunt `1.1x`) only when `sharpEdge` is enabled, while degradation penalties below `76%` always apply. Human bare-fist strikes call `weaponBlowMods(null, ...)` in `handToHandAttackDamage` and `pcaaoHandToHandAttackDamage` (`src/combat/formulas.js`). In `swingHandling` (`src/combat/swingLaw.js`), every `shortBlade` weapon uses `SWING_SHORT_BLADE = SWING_HANDLING[4]` (`0.9` versus Long Blade `1.0`) and never takes `SWING_TWO_HANDED` (`1.06`).

## Subcards

- `balance-arc-place-threat-elites-and-death`: location threat tiers, offline elites, and resurrection gold toll.
- `balance-arc-reflection-leech-and-arcane-caps`: non-lethal thorns, leech and potency caps, and retired affixes.
- `balance-arc-lycanthropy-and-vampirism`: beast-only lycanthrope stats, gauntlet claw metal, and vampire sunlight rules.
- `balance-arc-pvp-harm-ceiling-and-archery`: refereed PvP harm window, bow damage, and arrow speed.
