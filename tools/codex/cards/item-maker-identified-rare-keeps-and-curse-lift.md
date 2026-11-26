---
slug: item-maker-identified-rare-keeps-and-curse-lift
title: "Item Maker Identified Rare Eligibility, Free Ladder Rows, and Curse Lifting"
domain: items
kind: subcard
parent: crafting-writs-any-goods-and-firmament-magicka-overview
files:
  - src/magic/enchanting.js
  - src/ui/itemMakerWindow.js
  - src/items/lootRarity.js
  - src/items/lootCurse.js
  - src/items/itemLaw.js
  - src/professions/smithItems.js
  - src/ui/marketTab.js
  - src/magic/mysticism.js
  - src/magic/enchantments.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26.md"
related:
  - crafting-writs-any-goods-and-firmament-magicka-overview
  - loot-rarity-ladder-overview
  - loot-ii-cursed-finds-and-temple-lifting
  - professions-crafting-provenance-and-master-art
invariants:
  - "`rareKeeps(item)` (`src/magic/enchanting.js`) admits an item into the Item Maker when `lootRarityOn()` is true, `rarity === 'rare'`, `isIdentified === true`, neither `magic` nor `artifact` is set, and non-maker rows hold one `RARE_FLAVOURS` affix plus at most the curse drawback."
  - "`keptEnchantments` returns `null` for Legendaries and standard enchanted items so `itemMakerFilter` (`src/ui/itemMakerWindow.js`) excludes them."
  - "Pre-existing Rare ladder rows receive `enchantCost = 0` (so curse drawbacks grant zero bonus points) while still counting toward the 10-row limit, whereas newly added rows carry `makerLaid` (`enchantCost` defined)."
  - "`liftCurse` (`src/items/lootCurse.js`) removes the last matching curse row lacking `makerLaid`, preserving forced soul-trap drawbacks."
  - "The item maker offers only souls the player carries in filled soul traps or Azura's Star (`enumerateFilledTraps`), and Soul Bound spends one through `removeFilledTrap`."
traps:
  - "Unidentified Rares remain excluded so opening the Item Maker cannot reveal affixes for free."
  - "Enchanting a Masterwork clears `asMinted` and displays `CHANGED_PIECE_WHY` on market listings."
  - "`src/magic/mysticism.js` registers `removeFilledTrap` into `src/magic/enchantments.js` through `setEnchantmentEffectDoors`, because `mysticism.js` imports `enchantments.js` and the reverse import would make a cycle."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallItemMakerWindow.cs
  - Assets/Scripts/Game/Items/DaggerfallUnityItem.cs
tags:
  - item-maker
  - enchanting
  - rare
  - curse
  - masterwork
---

# Item Maker Identified Rare Eligibility, Free Ladder Rows, and Curse Lifting

Extending the DFU Item Maker (`Assets/Scripts/Game/UserInterfaceWindows/DaggerfallItemMakerWindow.cs`, `Assets/Scripts/Game/Items/DaggerfallUnityItem.cs`), `src/magic/enchanting.js` and `src/ui/itemMakerWindow.js` admit identified Rare ladder gear while locking pre-existing affix costs, preserving temple curse removal (`src/items/lootCurse.js`), and flagging modified Masterworks (`src/professions/smithItems.js`, `src/ui/marketTab.js`).

## Identified Rare Eligibility and Filter Rules

In `src/magic/enchanting.js`, `rareKeeps(item)` admits a Rare item into `itemMakerFilter` (`src/ui/itemMakerWindow.js`) only when `lootRarityOn()` (`src/items/lootRarity.js`) is active, `rarity === 'rare'`, `isIdentified === true`, neither `magic` nor `artifact` is set, and the non-maker rows consist of one `RARE_FLAVOURS` affix plus at most the curse drawback. Unidentified Rares stay excluded so players cannot inspect hidden affixes for free, and `keptEnchantments` returns `null` for Legendaries and standard enchanted gear.

## Zero-Cost Ladder Rows, Curse Lifting, and Masterwork Marks

- **Maker row budgeting (`src/magic/enchanting.js`, `src/items/itemLaw.js`):** Existing Rare ladder rows are seeded with `enchantCost = 0` so an innate curse grants zero bonus enchanting capacity, though those rows still count toward the 10-row slot cap. Newly added powers receive `makerLaid` with a defined `enchantCost`, and `makerFindings` (`src/items/itemLaw.js`) budgets only those newly laid rows.
- **Temple curse lifting and Masterworks (`src/items/lootCurse.js`, `src/professions/smithItems.js`, `src/ui/marketTab.js`):** `liftCurse` strips the last matching curse row that lacks `makerLaid`, leaving intentional soul-trap drawbacks intact. Enchanting a Masterwork clears `asMinted` and shows `CHANGED_PIECE_WHY` on market listings.
