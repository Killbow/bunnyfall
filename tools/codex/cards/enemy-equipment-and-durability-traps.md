---
slug: enemy-equipment-and-durability-traps
title: Enemy Equipment and Durability Traps
domain: combat
kind: overview
files:
  - src/combat/enemyEquipment.js
  - src/combat/formulas.js
  - src/characters/equip.js
invariants:
  - "equipmentItems pushes the exact rightHand and non-shield leftHand weapon objects into entity.items without cloning so combat durability wear and spent poison doses persist onto corpse loot."
  - "armorOfMaterial runs setItemFields and mintCondition when building droppable armor records so dropped pieces carry valid currentCondition and sale value."
traps:
  - "enemyArmorValues mirrors EnemyEntity.cs by stopping strictly before EquipSlots.Feet, leaving boots equipped and droppable as loot while excluding them from enemy armor values."
  - "Omitting mintCondition or setItemFields on enemy armor leaves pieces without condition for wear or causes smiths to value loot stacks at zero."
  - "A broken item is removed through `unequipItem` by item identity, not by the worn mark, because enemy gear has no mark. The order is the popup, then the unequip, then the Breaks payload."
dfu:
  - Assets/Scripts/Game/Entities/EnemyEntity.cs
  - Assets/Scripts/Game/Items/ItemHelper.cs
tags:
  - enemy-equipment
  - armor
  - durability
  - loot
  - dfu-parity
---

# Enemy Equipment and Durability Traps

`src/combat/enemyEquipment.js` ports `ItemHelper.AssignEnemyStartingEquipment` and `EnemyEntity.SetEnemyEquipment`, preserving two subtle invariants between active enemy gear and corpse loot.

- **Shared weapon reference:** `equipmentItems` pushes the exact `rightHand` and non-shield `leftHand` weapon objects into `entity.items` without cloning. The weapon swung in combat, held in the equip table (`src/characters/equip.js`), and dropped on death is one object, so condition wear from `damageEquipment` (`src/combat/formulas.js`) and spent poison doses persist onto corpse loot.
- **Armor condition and pricing:** `armorOfMaterial` runs `setItemFields` and `mintCondition` when building droppable armor records. Omitting either leaves enemy armor without `currentCondition` for combat wear or without `value` when sold to smiths.
- **The `EquipSlots.Feet` loop trap:** `enemyArmorValues` starts all seven body parts at `100`, subtracts `materialArmorValue * 5` per piece (and material-blind `SHIELD_VALUE * 5` on shield-covered parts), then clamps class enemies to `<= 60` and monsters to `entity.armor`. Matching `for (i = EquipSlots.Head; i < EquipSlots.Feet; i++)` (`12` to `26` exclusive) in `EnemyEntity.cs`, `BODY_PARTS.Feet` is skipped in the armor calculation even though boots remain equipped and still drop as loot.
