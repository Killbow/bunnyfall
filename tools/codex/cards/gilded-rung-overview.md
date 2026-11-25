---
slug: gilded-rung-overview
title: "The Gilded Rung: Static-Roll Top Rarity"
domain: items
kind: overview
parent: null
files:
  - src/items/gilded.js
  - src/items/lootRarity.js
  - src/items/rarityTier.js
  - src/items/itemLaw.js
  - src/items/loot.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gilded.md"
related:
  - gilded-records-mint-and-drops
  - gilded-powers-hour-tolls-dragonfire-undertow
  - gilded-look-and-door-refusals
  - loot-arc-overview
  - economy-ledger-and-item-judge
invariants:
  - "`RARITIES.gilded` in src/items/lootRarity.js is rank 6 (label 'Gilded'), above `artifact` rank 5. `RARITY_ORDER` ends with 'gilded'."
  - "Nothing rolls Gilded: `applyRarity` returns the item untouched unless the tier is in `ROLLED_TIERS` (src/items/rarityTier.js), and `rarityEligible` refuses any item that already has a `rarity`."
  - "`stampedTier` in rarityTier.js treats 'gilded' as a minted-whole tier, alongside 'aetheric'."
  - "A Gilded piece is a static roll. `validGildedMarks` (src/items/gilded.js) requires the group, templateIndex, material, and affixes on the record to match exactly, in order, by id, param, and value. It also rejects any field in `NEVER_ON_GILDED` (sigil, legendary, aetheric, imprint, cursed, socket, sockets, reforged, reforges, honed, exalted) and any DFU or custom enchantment."
  - "`validLootItem` in src/items/loot.js and the item law in src/items/itemLaw.js (finding 'gilded') both gate on `validGildedMarks`. One number off is a forgery."
traps:
  - "Header comments in gilded.js describe five records, gun eras, and Ketch guns, but the live code has three records and no eras (see ambiguousItems). Do not trust the prose over `GILDED_RECORDS`."
  - "`gildedRecordOf(item)` only resolves `item.gilded` by id. It has no template-based era lookup."
dfu: []
tags:
  - items
  - loot
  - rarity
  - gilded
  - static-roll
  - item-law
---

# The Gilded Rung: Static-Roll Top Rarity

Gilded (`GILDED = 'gilded'`) sits at rank `6` of `RARITIES` in `src/items/lootRarity.js`, above `artifact` (rank `5`) at the top of `RARITY_ORDER`. Unlike rolled tiers, every Gilded weapon is minted whole from a fixed record in `src/items/gilded.js` with static affixes and a signature combat power.

- **Minted-whole tier (`src/items/rarityTier.js`, `src/items/lootRarity.js`):** `ROLLED_TIERS` excludes `'gilded'`, `stampedTier` classifies `'gilded'` alongside `'aetheric'` as a minted-whole tier, `applyRarity` leaves any non-rolled tier untouched, and `rarityEligible` rejects items that already carry a `rarity`. Each minted piece stores `rarity: 'gilded'`, `gilded: <record id>`, and adds `GILDED_WORTH` (`12500`) to its gold value and `src/items/itemLaw.js` worth ceiling.
- **Static-roll verification (`src/items/gilded.js`, `src/items/loot.js`, `src/items/itemLaw.js`):** `gildedRecordOf(item)` resolves `item.gilded` via `gildedById`. Both `validLootItem` and the item judge (`finding: 'gilded'`) enforce `validGildedMarks`, which checks the record's exact `group`, `templateIndex`, `material`, and ordered `affixes` (`id`, `param`, `value`) while rejecting any key in `NEVER_ON_GILDED` and any DFU or custom enchantment.

## Subcards

- `gilded-records-mint-and-drops`: `GILDED_RECORDS`, `mintGilded`, seeded boss drop draws, and `lostLeftBy` checks.
- `gilded-powers-hour-tolls-dragonfire-undertow`: `HOUR_TOLLS`, `DRAGONFIRE`, and `UNDERTOW` combat mechanics.
- `gilded-look-and-door-refusals`: crimson UI palette, crown pips, and station refusals.
