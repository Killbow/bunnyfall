---
slug: pcaao-combat-overhaul-overview
title: "Physical Combat And Armor Overhaul Port: Modules and Overrides"
domain: combat
kind: overview
parent: null
files:
  - src/combat/pcaao.js
  - src/combat/formulas.js
  - src/world/worldTick.js
  - src/mods/modSettings.js
  - src/mods/rrRealism.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Physical-Combat-Overhaul.md"
related:
  - pcaao-hit-damage-and-condition-bands
  - pcaao-armor-reduction-shields-and-wear
  - pcaao-meaner-monsters-and-enemy-weapons
  - combat-formulas-and-power-ceiling
  - balance-arc-overview
invariants:
  - "`installPcaao` (`src/world/worldTick.js`) registers `damageModifier`, `damageEquipment`, `calculateAttackDamage`, `struckBodyPartTable`, `adjustWeaponHitChanceMod`, and `adjustWeaponAttackDamage` via `registerFormulaOverride`; each override returns `undefined` when its module is disabled."
  - "`pcaaoModules` reads switches live via `modSetting(\"pcaao\", k)` (`src/mods/modSettings.js`) without requiring a restart."
  - "Dependency chain: `fadingEnchantedItems` requires `equipmentDamageEnhanced`; `criticalStrikesIncreaseDamage`, `conditionBasedEffectiveness`, and `softMaterialRequirements` require `armorHitFormulaRedone`; all require `Enabled`."
traps:
  - "The two RR archery overrides register whatever `armorHitFormulaRedone` says; they gate on `rolePlayRealismArchery` (RR_VENDOR `Enabled` and `advancedArchery`)."
  - "VCEH mirror events (OnAttackDamageCalculated, OnSavingThrow) and the soft-material Debug.LogFormat are deliberately not ported."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
tags:
  - pcaao
  - combat
  - formula-override
  - mods
  - dfu-parity
---

# Physical Combat And Armor Overhaul Port: Modules and Overrides

`src/combat/pcaao.js` ports Physical Combat And Armor Overhaul v1.44 (`PCAAO_VENDOR = "pcaao"`, `PCAAO_VERSION = "1.44"`), matching upstream math with `unityRound` half-to-even rounding, `Math.fround` float32 boundaries, and `Math.trunc` integer division.

- **Override Registration and Live Switches (`src/world/worldTick.js`, `src/combat/formulas.js`, `src/mods/modSettings.js`):** `installPcaao` calls `registerFormulaOverride` for `damageModifier`, `damageEquipment`, `calculateAttackDamage`, `struckBodyPartTable`, `adjustWeaponHitChanceMod`, and `adjustWeaponAttackDamage`. Each override checks `pcaaoModules` via live `modSetting("pcaao", k)` reads and returns `undefined` when disabled so `FormulaHelper` falls back cleanly.
- **Module Dependencies and Defaults (`src/combat/pcaao.js`, `src/mods/rrRealism.js`):** Default switches enable `Enabled`, `fixedStrengthDamageModifier`, `armorHitFormulaRedone`, `criticalStrikesIncreaseDamage`, `conditionBasedEffectiveness`, and `softMaterialRequirements`, while keeping `equipmentDamageEnhanced` and `fadingEnchantedItems` off. `fadingEnchantedItems` requires `equipmentDamageEnhanced`; `criticalStrikesIncreaseDamage`, `conditionBasedEffectiveness`, and `softMaterialRequirements` require `armorHitFormulaRedone`. The archery hooks register regardless of `armorHitFormulaRedone` and gate on `rolePlayRealismArchery`.
- **Subcards:** See `pcaao-hit-damage-and-condition-bands`, `pcaao-armor-reduction-shields-and-wear`, and `pcaao-meaner-monsters-and-enemy-weapons`. For shared symmetric strike rules and composite caps, see `balance-arc-overview` and `combat-formulas-and-power-ceiling`.
