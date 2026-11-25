---
slug: pcaao-hit-damage-and-condition-bands
title: "PCAAO Hit Chance, Weapon Damage, and Condition Bands"
domain: combat
kind: subcard
parent: pcaao-combat-overhaul-overview
files:
  - src/combat/pcaao.js
  - src/combat/clawMetal.js
  - src/combat/playerWeapon.js
  - src/mods/rrRealism.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Physical-Combat-Overhaul.md"
related:
  - pcaao-combat-overhaul-overview
  - balance-arc-overview
  - balance-arc-lycanthropy-and-vampirism
  - combat-formulas-and-power-ceiling
invariants:
  - "`pcaaoSuccessfulHit` clamps final hit chance to `PCAAO_HIT_CHANCE_MIN = 3` through `PCAAO_HIT_CHANCE_MAX = 97` in both directions."
  - "`pcaaoDamageModifier` equals `floor((STR - 50) / 10)`, and `pcaaoWeaponToHit` equals `materialModifier * 2 + 2` (giving Daedric `+14` rather than stock `+60`)."
  - "Every striker computes skill to-hit as `ceil(skill * 1.5)` and rolls critical strike at `crit / (4 - luckTerm)`."
traps:
  - "In `pcaaoArmorToHit`, players use `100 - entityEnchantArmorMod - entityArmorPoints`, class enemies use flat `60`, and monsters read the struck slot in `armorValues`."
  - "Unarmed class enemies deal only `damageModifier` (the min-to-max fist roll applies to players only)."
  - "When `equipmentDamageEnhanced` is off, `pcaaoAlterDamageBasedOnWepCondition` returns unmodified `1.0x` damage at `>= 76%` condition while preserving worn penalties below `76%`."
  - "In `rrAdjustWeaponHitChanceMod` (`src/mods/rrRealism.js`), the `> 8000` ms bow draw branch sits unreachable behind `> 5000` ms to preserve upstream parity."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/WeaponManager.cs
tags:
  - pcaao
  - hit-chance
  - critical-strike
  - silver
  - condition
  - archery
---

# PCAAO Hit Chance, Weapon Damage, and Condition Bands

`src/combat/pcaao.js` replaces stock hit-location weights, material accuracy, strength bonuses, silver multipliers, and weapon condition bands while integrating with `src/combat/playerWeapon.js` and `src/mods/rrRealism.js`.

- **Hit Locations, Accuracy, and Armor Target (`src/combat/pcaao.js`):** `PCAAO_BODY_PARTS` is a 20-slot hit table (head `1` slot, feet `2`, legs `4`). `pcaaoWeaponToHit` scales weapon accuracy to `materialModifier * 2 + 2` (`+14` for Daedric instead of stock `+60`), and `pcaaoSuccessfulHit` clamps final hit chance to `PCAAO_HIT_CHANCE_MIN = 3` through `PCAAO_HIT_CHANCE_MAX = 97`. In `pcaaoArmorToHit`, players use `100 - entityEnchantArmorMod - entityArmorPoints`, class enemies use flat `60`, and monsters read `armorValues` on the struck slot. For shared `ceil(skill * 1.5)` and `crit / (4 - luckTerm)` striker rolls, see `balance-arc-overview`.
- **Damage, Silver, Condition Bands, and Draw Time (`src/combat/pcaao.js`, `src/combat/playerWeapon.js`, `src/mods/rrRealism.js`):** `pcaaoDamageModifier` equals `floor((STR - 50) / 10)` and applies twice on bows and two-handed weapons; unarmed class enemies deal only `damageModifier`. `SILVER_DOUBLED_CAREERS` (`[9, 18, 23, 28, 19, 14]`: Werewolf, Ghost, Wraith, Vampire, Mummy, and Wereboar) take double damage from silver unless `silverDoubles` vetoes it, while Skeletal Warrior (`15`) halves weapons lacking the `0x10` flag. `pcaaoAlterDamageBasedOnWepCondition` scales blades by `1.3x` (`>= 92%`), `1.1x` (`76-91%`), `0.85x`, `0.7x`, `0.45x`, and `0.25x` (`<= 5%`), returning `1.0x` at `>= 76%` when `equipmentDamageEnhanced` is off. `playerWeapon.lastDrawMs` feeds `weaponAnimTime` (`0` on instant shots) into `rrAdjustWeaponHitChanceMod`, where the `> 8000` ms branch sits unreachable behind `> 5000` ms.
