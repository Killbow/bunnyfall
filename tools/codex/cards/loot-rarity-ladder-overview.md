---
slug: loot-rarity-ladder-overview
title: "Loot Rarity Item Ladder Overview"
domain: items
kind: overview
parent: null
files:
  - src/items/lootRarity.js
  - src/items/rarityTier.js
  - src/mods/features.js
  - src/ui/uiPrefs.js
  - src/items/itemFields.js
  - src/items/itemInfo.js
  - src/saves/save.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Rarity.md"
related:
  - loot-rarity-source-odds-and-host-seams
  - loot-rarity-affix-lines-and-armor-lean
  - loot-arc-overview
  - loot-ii-arc-overview
  - gilded-rung-overview
  - economy-ledger-and-item-judge
invariants:
  - "`lootRarityOn()` reads `getPref(LOOT_RARITY_KEY)`; the `lootRarity` row in `src/mods/features.js` is `initial: true, online: true` (LR5 on by default, the online lane forces it on)."
  - "`rarityOf(item)`: `artifact` for DFU artifacts, the item's own rolled `rarity` string, else `magic` for any enchanted or `item.magic` piece, else `common`."
  - "`rarityEligible` refuses quest items, artifacts, DFU magic items, already-rolled or enchanted pieces, equipped pieces, ammunition, and anything `wearableItem` rejects (RARITY-WEAR)."
  - "Item fields `rarity` (oneOf `RARITY_ORDER`), `legendary`, and `affixes` (list of `validAffix`) are validated in `src/items/itemFields.js`; malformed affixes fold nothing."
traps:
  - "With the switch off, no rarity field is written and DFU's own loot stands unchanged."
  - "Affixes never live in `item.enchantments`; DFU's closed enchantment enum stays separate."
  - "`repairRarityBases` (called from `src/saves/save.js`) moves a rolled Wand to `RARITY_HOME.Jewellery` (133, Amulet); `rehomedPrint` lets the ledger treat it as the same piece."
dfu: []
tags:
  - loot
  - rarity
  - ladder
  - items
  - prefs
---

# Loot Rarity Item Ladder Overview

The loot rarity ladder (`src/items/lootRarity.js`, `src/items/rarityTier.js`) classifies equipment across seven ordered tiers in `RARITY_ORDER` (ranks `0` through `6`): `common`, `magic` (`#6f9ee8`), `rare` (`#e4c34f`), `legendary` (`#e07a2e`), `aetheric` (`#bfe8ff`), `artifact` (`#b57bee`), and `gilded` (`#ff3b4a`).

- **Feature Gate, Classification, and Eligibility (`src/mods/features.js`, `src/ui/uiPrefs.js`, `src/items/lootRarity.js`):** `lootRarityOn()` reads `getPref(LOOT_RARITY_KEY)`, where `lootRarity` defaults to `initial: true` and `online: true`. When disabled, no rarity fields are written and classic DFU loot remains untouched. `rarityOf(item)` resolves `artifact` for DFU artifacts, the rolled `item.rarity` string if present, `magic` for enchanted or `item.magic` pieces, and `common` otherwise. `rarityEligible` rejects quest items, artifacts, DFU magic items, already-rolled or enchanted gear, equipped items, ammunition, and anything `wearableItem` refuses.
- **Validation, Identification, Worth, and Base Repair (`src/items/itemFields.js`, `src/items/itemInfo.js`, `src/saves/save.js`):** `itemFields.js` validates `rarity`, `legendary`, and `affixes` (`validAffix`), keeping affixes out of `item.enchantments`. Numeric Magic drops arrive identified, whereas Rare and Legendary drops carry real DFU enchantments, require identification, and play `SOUND.MakeItem`. Gold value adds `AFFIX_WORTH` per point plus `RARE_ENCHANT_WORTH` (`600`, halved on garments by `GARMENT_WORTH_SHARE = 0.5`). On load, `repairRarityBases` moves rolled Wands to `RARITY_HOME.Jewellery` (`133`, Amulet) while `rehomedPrint` preserves ledger identity.
