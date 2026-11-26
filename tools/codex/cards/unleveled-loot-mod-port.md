---
slug: unleveled-loot-mod-port
title: "Unleveled Loot Mod Port"
domain: items
kind: subcard
parent: loot-arc-overview
files:
  - src/items/unleveledLoot.js
  - src/combat/enemyEquipment.js
  - src/combat/formulas.js
routes: []
tables: []
related:
  - loot-arc-overview
  - loot-rarity-source-odds-and-host-seams
invariants:
  - "A Daedra or Orc armor drop is a new item built over the template of a random armor piece. Its condition is rolled from the maximum of that random piece, as the 1.1.2 DLL does, and then clamped to the maximum of the new piece."
traps:
  - "No Roleplay Realism port registers a `randomMaterial` override yet. If one is added, it must register before the override in `src/items/unleveledLoot.js`, matching the order the mod manifest sets, because `registerFormulaOverride` keeps only the last registration."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/Items/ItemBuilder.cs
tags:
  - loot
  - mods
  - materials
---

# Unleveled Loot Mod Port

`src/items/unleveledLoot.js` ports the Unleveled Loot 1.1.2 mod. Materials roll on Luck, shop quality, and dungeon type instead of the player level, and corpse gold divides by level. The port follows the 1.1.2 DLL, quirks included, and marks its departures.

- **Overrides:** the module registers `randomMaterial`, `randomArmorMaterial`, and `modifyFoundLootItems` through `registerFormulaOverride`. Each returns `undefined` when the mod is off, so the stock formula runs. `src/combat/enemyEquipment.js` reads `randomMaterial` and `randomArmorMaterial` through `formulaOverride`.
- **Enemy drops:** when the mod settings allow it, Daedra and enemies on the Orcs team can drop an extra weapon or armor piece (`addDaedric`, `addOrcish`), and a drop from Daedra id 29 is always a weapon. The condition rolls between 30% and 75% of the maximum (for armor, the maximum of a random piece, as the invariant says). Each drop records `foundCondition`, so a mended drop sells at the condition it dropped with.
