---
slug: pcaao-armor-reduction-shields-and-wear
title: "PCAAO Armor Reduction, Shield Blocks, and Wear Routing"
domain: combat
kind: subcard
parent: pcaao-combat-overhaul-overview
files:
  - src/combat/pcaao.js
  - src/combat/formulas.js
  - src/characters/equip.js
  - src/items/armorMaterials.js
  - src/magic/enchantments.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Physical-Combat-Overhaul.md"
related:
  - pcaao-combat-overhaul-overview
  - economy-arc-repair-wear-and-kits
  - shield-widget-overview
  - two-hands-overview
invariants:
  - "With `equipmentDamageEnhanced` on, `pcaaoDamageEquipment` applies wear from pre-reduction damage; when off (default), `FormulaHelper` `damageEquipment` applies wear from post-reduction damage."
  - "`leftHandShield` returns the `LeftHand` item only when `isShield` (`Armor` group and `isShieldTemplate`), preventing off-hand weapons from blocking as leather bucklers."
  - "`pcaaoCompareShieldToUnderArmor` lets a shield reduce damage only when its 100-point average reduction equals or beats the armor piece underneath."
traps:
  - "Shield base block chances (strong/weak) are Buckler `109` (`30/20`), Round `110` (`35/10`), Kite `111` (`45/5`), Tower `112` (`55/-5`), and default `40/0`, with upstream `Mathf.Clamp` results discarded."
  - "Condition threshold warnings repeat while an item sits at `48%` or `15%`, and `fadingEnchantedItems` destroys broken player enchanted gear while sparing rarity-stamped pieces (`pcaaoFades`)."
  - "`updateEquippedArmorValues` gives armor value to boots and shoes in the clothing footwear id window, but sandals (150 and 189) sit outside it and give nothing. This matches the original game."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/Items/DaggerfallUnityItem.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/RepairsObjects.cs
tags:
  - pcaao
  - armor
  - shield
  - wear
  - durability
  - wear-vanilla
---

# PCAAO Armor Reduction, Shield Blocks, and Wear Routing

`src/combat/pcaao.js` resolves percentage armor reduction, shield block interception, condition scaling, and equipment wear across `src/combat/formulas.js`, `src/characters/equip.js`, `src/items/armorMaterials.js`, and `src/magic/enchantments.js`.

- **Reduction Tables and Shield Interception (`src/combat/pcaao.js`, `src/items/armorMaterials.js`):** `PCAAO_REDUCTION_ROWS` stores unarmed, blunt, edged, shield, and average reduction tables. `leftHandShield` returns the `LeftHand` item only when `isShield` (`Armor` group and `isShieldTemplate`) holds, preventing off-hand weapons from acting as leather bucklers. Shield base block chances (strong/weak) are Buckler `109` (`30/20`), Round `110` (`35/10`), Kite `111` (`45/5`), Tower `112` (`55/-5`), and default `40/0` (preserving the discarded upstream `Mathf.Clamp` call). When a block succeeds, `pcaaoCompareShieldToUnderArmor` applies shield reduction only if its 100-point average reduction equals or exceeds the armor piece underneath.
- **Condition Multipliers, Wear Routing, and Self-Repair (`src/combat/pcaao.js`, `src/characters/equip.js`, `src/magic/enchantments.js`):** `conditionBasedEffectiveness` scales armor reduction multipliers from `0.85` (`>= 92%` condition) to `1.5` (`<= 5%`), clamping the `>= 76%` bonus to `1` when enhanced wear is off. With `equipmentDamageEnhanced` on, `pcaaoDamageEquipment` taxes gear from pre-reduction damage, repeats warnings while condition sits at `48%` or `15%`, and under `fadingEnchantedItems` destroys broken enchanted player items unless rarity-stamped (`pcaaoFades`). When off, `FormulaHelper` `damageEquipment` applies post-reduction wear (`DFU_WEAR_MULTIPLE = 1`, `CONDITION_WEAR_SCALE = 1`). `repairsObjectsTarget` sorts by `mendTier` (`0` worn, `1` worn with `wearsItself`, `2` carried) and `mendOrder`, skipping `isNotRepairable` templates.
