---
slug: loot-ii-junk-quick-loot-and-ayleid-stones
title: "Line Comparison, Junk Marks, Quick-Loot Filter, and Ayleid Stones"
domain: items
kind: subcard
parent: loot-ii-arc-overview
files:
  - src/items/itemJunk.js
  - src/items/quickLoot.js
  - src/mods/features.js
  - src/ui/enhancedTrade.js
  - src/ui/enhancedInventory.js
  - src/ui/armourCard.js
  - src/ui/reforgeWindow.js
  - src/items/ayleidStones.js
  - src/items/itemTemplates.js
  - src/items/lootRarity.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-II-Arc.md"
related:
  - loot-ii-arc-overview
  - items-gold-counter-and-wagon
  - market-vendors-and-professions
invariants:
  - "Junk marking applies only to `JUNK_GROUPS` gear that is neither a quest item nor bound; marking an item as junk clears its lock, and locking an item clears its junk flag (`lockLiftsJunk`)."
  - "`takeAllLeaves` always skips junk items, never skips quest items, and under `'magic'` or `'rare'` `quickLootTier` settings leaves only lower-tier ladder gear while taking gold, supplies, ammo, and DFU magic items."
  - "Using a Welkynd Stone (`WELKYND_STONE_TIER = 6`) refills magicka, and using a Varla Stone (`VARLA_STONE_TIER = 10`) restores `currentCondition` to `maxCondition` on worn enchanted gear (`varlaMends`), consuming neither stone when no restoration is needed."
traps:
  - "Worn items marked as junk are excluded from the `'Sell junk (n)'` trade footer, and completing a sale clears the junk flag (`setJunk`) so buyback items do not remain marked."
dfu: []
tags:
  - junk
  - quick-loot
  - comparison
  - ayleid-stones
  - salvage
---

Tooltip stat diffs, junk management, quick-loot tier filtering, bulk Magic salvaging, and consumable Ayleid stones live across `src/ui/armourCard.js`, `src/items/itemJunk.js`, `src/items/quickLoot.js`, `src/ui/reforgeWindow.js`, and `src/items/ayleidStones.js`.

## Line Comparison, Junk Flags, and Quick-Loot Filter

`lineComparison`, `lineCompareBlock`, and `wearComparison` (`src/ui/armourCard.js`) compute affix deltas between an inspected item and the equipped pieces it would replace, honoring the effective `RESIST_CAP` from `rolledResistOf` and skipping unidentified worn gear.

`src/items/itemJunk.js` lets players flag non-quest, unbound gear in `JUNK_GROUPS` as junk (`item.junk`). Setting the junk flag clears any item lock, and locking an item clears `item.junk` via `lockLiftsJunk`. In `src/ui/enhancedTrade.js`, the `'Sell junk (n)'` footer sells all unequipped junk in one batch and clears `setJunk` on sold records. In `src/ui/reforgeWindow.js`, bulk Magic salvage prompts with `EVERY_MAGIC_ASK` and summarizes results via `SALVAGED_EVERY`.

`src/items/quickLoot.js` reads the `quickLootTier` preference (`QUICK_LOOT_TIER` in `src/mods/features.js`: All, Magic+, or Rare+). When looting a pile, `takeAllLeaves` always leaves junk behind, always takes quest items, gold, supplies, ammunition, and classic DFU magic items, and filters out only lower-tier ladder gear, displaying `QUICK_LOOT_LEFT` when items remain.

## Ayleid Stones

`src/items/ayleidStones.js` registers the Welkynd Stone (`WELKYND_STONE_TIER = 6`) and Varla Stone (`VARLA_STONE_TIER = 10`) via `registerUniqueFind({ late: true })` (rolled by `rollLateFinds`) and `registerItemUseHandler`. `useWelkyndStone` restores the player's magicka to full, while `useVarlaStone` repairs `currentCondition` to `maxCondition` across all worn enchanted pieces (`varlaMends`). Neither stone is consumed if the player already has full magicka or no damaged worn enchanted items.
