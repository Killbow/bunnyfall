---
slug: items-gold-counter-and-wagon
title: Items, Gold Counter, and Wagon Limits
domain: items
kind: overview
files:
  - src/items/inventory.js
  - src/items/itemTransfer.js
  - src/items/useItem.js
related:
  - grappling-hook-tool
invariants:
  - "Carried player gold lives on entity.goldPieces rather than inside entity.items, while gold in wagons, loot piles, and trade baskets remains a Currency item stack."
  - "carriedWeight sums item weights and goldPieces at 0.0025 kg per coin scaled by carryFactor, while canHoldAmount evaluates integer gold-piece weight units."
traps:
  - "applyTransfer must skip gold-counter interception for server-settled shared chests (from.pileCoins === true) to prevent crediting gold twice."
  - "useItem preserves DFU's +66 DRUG_POISON_OFFSET on drug templates 78..81, producing poison IDs 144..147 so inflictPoison does nothing while consuming the drug."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallInventoryWindow.cs
  - Assets/Scripts/Game/Entities/PlayerEntity.cs
tags:
  - items
  - gold
  - encumbrance
  - wagon
  - dfu-parity
---

# Items, Gold Counter, and Wagon Limits

Player inventory separates currency counters from container item stacks across `src/items/inventory.js`, `src/items/itemTransfer.js`, and `src/items/useItem.js`.

- **`GoldPieces` counter vs. gold stacks:** Carried player gold lives on `entity.goldPieces` (`GOLD_TEMPLATE = 276`), never inside `entity.items`. `applyTransfer` and `takeOneInto` intercept `isGoldPieces` transfers when `toPlayer` is true (except server-settled chests with `from.pileCoins === true`), calling `addGoldPieces` and returning `null` (which also reproduces DFU leaving choose-one reward pickers open on gold picks). Gold in wagons, loot piles, and trade baskets remains a `Currency` item stack (`goldStack`).
- **`CarriedWeight` and 750 kg cart limit:** `carriedWeight` sums `(totalWeight(items) + goldPieces * GOLD_PIECE_WEIGHT_KG) * carryFactor(entity)` (`GOLD_PIECE_WEIGHT_KG = 0.0025`). `WAGON_KG_LIMIT` defaults to `750` kg (`SMALL_CART_KG`). `canHoldAmount` runs integer division in gold-piece weight units (`Math.round(kg * 400)`), splitting partial stacks via `splitStack` or clamping dropped gold in `planDropGold`.
- **The `+66` drug offset no-op:** `useItem` preserves `DaggerfallInventoryWindow.UseItem` (`FIRST_DRUG_TEMPLATE = 78`, `DRUG_POISON_OFFSET = 66`). Adding `66` to templates `78..81` yields `144..147` (`Poison-144`) instead of `136..139`, so `inflictPoison` does nothing while still consuming the item.
