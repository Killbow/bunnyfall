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
invariants:
  - "calculateAttackDamage evaluates target.minMetalToHit first and clamps final hit chance from calculateSuccessfulHit between 3 and 97."
  - "weaponAttackDamage derives baseDamageMin and baseDamageMax from templateIndex per swing and halves non-0x10 weapons against skeletal targets."
  - "blowRoom and guardRoom in src/characters/powerCeiling.js enforce per-registry limits alongside composite caps (43.18x damage ceiling and 10.71% minimum damage taken)."
traps:
  - "Enemy-vs-enemy combat must call dropWeaponIfTargetImmune before swinging against material-immune targets so attackers fall back to hand-to-hand."
  - "Flat-point wards, Bulwark, and Shield pools sit outside GUARD_LEAST and do not scale with percentage guard caps."
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
