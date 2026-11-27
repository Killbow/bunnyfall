---
slug: economy-arc-repair-wear-and-kits
title: "Repair Cost, Vanilla Wear, Weapon Pool, and Kit Ceiling"
domain: economy
kind: subcard
parent: economy-arc-overview
files:
  - src/trade/repairService.js
  - src/characters/equip.js
  - src/characters/weapons.js
  - src/items/itemTemplates.js
  - src/items/conditionRepair.js
  - src/professions/smithItems.js
  - src/net/recipeLaw.js
  - src/magic/enchantments.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Economy-Arc.md"
related:
  - economy-arc-overview
  - economy-arc-found-mark-and-mend-resale
  - enemy-equipment-and-durability-traps
  - stores-beds-grog-mending-and-wild-escrow-overview
invariants:
  - "`calculateItemRepairCost` returns `max(1, round(cost * REPAIR_COST_SCALE))` with `REPAIR_COST_SCALE = 1 / 3`."
  - "`DFU_WEAR_MULTIPLE = 1`."
  - "Every non-ammunition weapon mints from `WEAPON_CONDITION_POOL = 1600`; `maxCondition = trunc(pool * conditionMultipliersByMaterial[material] / 4)`. Arrows keep the hitPoints from their template row."
  - "`kitCeiling = floor(maxCondition * kitReach(kit))`: `KIT_CEILING = 0.75`, or `KIT_CEILING_HIGH = 0.9` for Superior and Masterwork kits. A kit mends `FIELD_KIT_REPAIR = 0.15` (field) or `KIT_REPAIR = 0.25` of maxCondition per use."
  - "A Repairs Objects tick (`repairsObjectsTarget`) mends worn pieces first, then worn pieces that wear themselves (Cast When Held or Item Deteriorates), then the pack. It skips pieces a smith will not repair (`isNotRepairable`), wagons, and enchanted pieces unless `allowMagicRepairs` is on."
traps:
  - "`kitGives` refuses a piece whose gap to the ceiling is at most `floor(maxCondition / 100)`, so no kit is spent on a 75%-to-75% mend."
  - "A Repairs Objects tick (every `CONDITION_PER_ROUNDS = 4` rounds, in play and in rest) mends `round(maxCondition / MEND_SHARE_OF)` (a fiftieth), but magic items and artifacts mend only `CONDITION_AMOUNT = 1`."
  - "`weightForMaterial` rounds half to even through `roundHalfEven`, as Unity's `Mathf.Round` does. `Math.round` would turn 22.5 quarter-kilograms into 23 where Daggerfall Unity gives 22."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/RepairsObjects.cs
tags:
  - repairs
  - durability
  - wear
  - repair-kit
  - weapon-pool
---

# Repair Cost, Vanilla Wear, Weapon Pool, and Kit Ceiling

Repair pricing, vanilla wear rates, weapon condition pools, and repair kit ceilings make durability a field pacing limit rather than a heavy tax (`src/trade/repairService.js`, `src/characters/equip.js`, `src/characters/weapons.js`, `src/items/conditionRepair.js`).

## Repair Scale, Wear, and Weapon Pool

- **Repair cost and wear (`src/trade/repairService.js`, `src/characters/equip.js`):** `calculateItemRepairCost` returns `max(1, round(cost * REPAIR_COST_SCALE))` with `REPAIR_COST_SCALE = 1 / 3`. Equipment wears at vanilla speed (`DFU_WEAR_MULTIPLE = 1`).
- **Weapon condition pool (`src/characters/weapons.js`, `src/items/itemTemplates.js`):** Every non-ammunition weapon derives durability from `WEAPON_CONDITION_POOL = 1600` via `maxCondition = trunc(pool * conditionMultipliersByMaterial[material] / 4)`, while arrows keep `hitPoints` from their template row. When repooling an item, `scaleFoundMark` rescales `foundCondition` and `selfMended`.

## Kit Ceilings and Enchantment Mending

- **Repair kits (`src/items/conditionRepair.js`, `src/professions/smithItems.js`, `src/net/recipeLaw.js`):** Kits restore `FIELD_KIT_REPAIR = 0.15` (field) or `KIT_REPAIR = 0.25` of `maxCondition` per use up to `kitCeiling = floor(maxCondition * kitReach(kit))`, where `KIT_CEILING = 0.75` and `KIT_CEILING_HIGH = 0.9` for Superior and Masterwork kits. `kitGives` blocks uses when the gap to the ceiling is at most `floor(maxCondition / 100)`.
- **Repairs Objects ticks (`src/magic/enchantments.js`):** Every `CONDITION_PER_ROUNDS = 4` rounds in play or rest, Repairs Objects mends `round(maxCondition / MEND_SHARE_OF)` (`1/50`), while magic items and artifacts mend only `CONDITION_AMOUNT = 1`.
