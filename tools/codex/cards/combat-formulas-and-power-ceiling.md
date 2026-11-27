---
slug: combat-formulas-and-power-ceiling
title: Combat Formulas and Power Ceiling
domain: combat
kind: overview
files:
  - src/combat/formulas.js
  - src/combat/playerWeapon.js
  - src/characters/powerCeiling.js
  - tools/powerCeiling.mjs
  - src/combat/pcaao.js
  - src/ui/armourCard.js
  - src/ui/chargen.js
  - src/magic/enchantments.js
invariants:
  - "calculateAttackDamage evaluates target.minMetalToHit first and clamps final hit chance from calculateSuccessfulHit between 3 and 97."
  - "weaponAttackDamage derives baseDamageMin and baseDamageMax from templateIndex per swing and halves non-0x10 weapons against skeletal targets."
  - "blowRoom and guardRoom in src/characters/powerCeiling.js enforce per-registry limits alongside composite caps (43.18x damage ceiling and 10.71% minimum damage taken)."
  - "An off-hand blow (`blowWeight` below 1) counts as whole only when one extra roll lands under `blowWeight`; every other blow is whole and draws no extra roll. Only a whole blow runs the weapon Strikes payloads, and player strike listeners receive the result as `info.blow`."
  - "`calculateAttackDamage` passes `nowMinutes` as `null`, not 0, when `enchantCtx` gives no minute, so `doItemEnchantmentPayloads` tries the merged host clock (`ctx.now()`) before it falls back to minute 0 for the HealthLeech use time."
  - "Class enemies with the Burglar, Rogue, Acrobat, Thief, Assassin, or Nightblade career use Streetwise for pacification (`CLASS_STREETWISE`), and every other class uses Etiquette, following DFU. Classic uses Etiquette for every class."
  - "`handToHandAttackDamage` adds the Strength `damageModifier` for the player only, as DFU does. Classic applies none, despite the Strength description in the game."
  - "`handToHandMaxDamage` is `skill / 5 + 1` at every skill, as in DFU and the classic character sheet, not the `+ 2` that the Daggerfall Chronicles table lists for skills of 80 and above."
  - "Callers that hold a live entity read `entityMaxEncumbrance`, which adds `Math.trunc(amount * multiplier)` for a positive IncreasedWeightAllowance multiplier. The chargen bonus-stats screen (`src/ui/chargen.js`) reads raw `maxEncumbrance` off working stats, because no entity exists yet."
  - "The tail of `calculateAttackDamage` runs after both the stock core and a registered core, because DFU does that work in every caller. Only the stock core's ineffective-material return skips it. The tail ends normal-power concealment on the attacker (`breakNormalPowerConcealment`) whenever the attack deals damage."
traps:
  - "Enemy-vs-enemy combat must call dropWeaponIfTargetImmune before swinging against material-immune targets so attackers fall back to hand-to-hand."
  - "Flat-point wards, Bulwark, and Shield pools sit outside GUARD_LEAST and do not scale with percentage guard caps."
  - "A registered core that rolls struck parts from its own table must also register a `struckBodyPartTable` override. `src/combat/pcaao.js` returns `PCAAO_BODY_PARTS` when `armorHitFormulaRedone` is on and `undefined` to decline otherwise, and `struckCounts` (`src/ui/armourCard.js`) weighs parts by whichever table is in force, with `STRUCK_BODY_PARTS` as the fallback."
  - "`damageEquipment` consults the registered override before its weapon and damage check, because the PCAAO version also wears gear on unarmed blows."
  - "`weaponKnockbackSpeed` divides by the classic weight of the target and is undefined at 0. For a monster, the `mobileWeight > 0` term of `weaponKnockbackApplies` is the only gate, and it is what keeps zero-weight monsters such as Ghost and Wraith out of that division."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/WeaponManager.cs
tags:
  - combat
  - formulas
  - swing-modifiers
  - power-ceiling
  - legendary
---

# Combat Formulas and Power Ceiling

`src/combat/formulas.js` implements `FormulaHelper` hit, material, and damage rolls, while `src/characters/powerCeiling.js` bounds horizontal progression multipliers.

- **Material gate and to-hit roll:** `calculateAttackDamage` checks `target.minMetalToHit` first (enemy-vs-enemy swings call `dropWeaponIfTargetImmune` beforehand to fall back to hand-to-hand). `calculateSuccessfulHit` sums struck-part armor (`armorValues[struckBodyPart]`), `adrenalineRushToHit`, `enchantChanceToHitMod`, `statsToHit`, `skillsToHit` (preserving classic `Dodging / 4` and hit-chance `CriticalStrike`), and `adjustmentsToHit` (`+40` vs. monsters, `-50` flat), clamped to `3..97`.
- **Swing directions and damage:** `SWING_MODS` (`src/combat/playerWeapon.js`) trades hit chance for damage across `StrikeUp` (`-4` damage, `+10` to-hit), `StrikeDownRight` (`-2`, `+5`), `StrikeLeft`/`StrikeRight` (`0`, `0`), `StrikeDownLeft` (`+2`, `-5`), and `StrikeDown` (`+4`, `-10`). `weaponAttackDamage` derives `baseDamageMin`/`baseDamageMax` from `templateIndex` on each swing, halves non-`0x10` weapons against skeletal targets (doubling silver unless `silverDoubles` vetoes), and adds `damageModifier` plus `WEAPON_MATERIAL_MODIFIER`.
- **Horizontal power ceilings:** `blowRoom` and `guardRoom` (`src/characters/powerCeiling.js`) enforce per-registry caps (`BLOW_TOPS`, `GUARD_TOPS`) alongside composite limits (`BLOW_MOST` at `43.18x`, `GUARD_LEAST` keeping `10.71%` damage). `tools/powerCeiling.mjs` (`lineTop`) verifies affixes, sigil sets, paths, and Firmament stars against Legendary band maximums (`AFFIX_RANGES[id].legendary[1]`).
