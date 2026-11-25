---
slug: loot-ii-reforge-honing-scry-and-sockets
title: "Reforge Honing, Dungeon Scrying, and Gem Sockets"
domain: items
kind: subcard
parent: loot-ii-arc-overview
files:
  - src/items/reforge.js
  - src/items/lootRarity.js
  - src/items/lootScry.js
  - src/maps/discovery.js
  - src/items/gemGrades.js
  - src/ui/reforgeWindow.js
  - src/scenes/world.js
  - src/items/itemFields.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-II-Arc.md"
related:
  - loot-ii-arc-overview
  - economy-ledger-and-item-judge
  - balance-arc-reflection-leech-and-arcane-caps
invariants:
  - "`honeAffix` raises a rolled line straight to its band maximum (`band[1]`); `honeableLines` excludes lines already at the band top as well as fixed record lines, and only Magic, Rare, and Exalted Legendary items qualify."
  - "`honePrice` multiplies each point of gain to the band top by `HONE_PRICE_PER_POINT`: Magic costs 2 shards and 300 gold, Rare costs 3 shards and 800 gold, and Exalted costs 5 shards and 2,000 gold per point."
  - "`SCRY_PRICE` charges 3 shards and 500 gold to reveal the nearest undiscovered dungeon of a chosen family in the current region via `discoverLocation`, refusing `'none'` before payment."
  - "`socketPass` grants an empty socket to 150 per mille of Rare and 300 per mille of Legendary items (`SOCKET_PER_MILLE`) in `SOCKET_GROUPS` (never garments), and gem lines are never reforged or honed."
traps:
  - "Calling `unsetGemPiece` shatters the socketed gem; only the Reforge extraction service (`EXTRACT_PRICE`, 50 to 800 gold by gem grade) recovers the gem intact."
  - "`takeGem` and `looseGem` reject quest, locked, worn, or enchanted gems so players cannot socket protected items."
dfu: []
tags:
  - reforge
  - honing
  - scry
  - sockets
  - gems
---

Reforge honing, regional dungeon scrying, and gem socketing live in `src/items/reforge.js`, `src/items/lootScry.js`, `src/items/lootRarity.js`, `src/items/gemGrades.js`, and `src/ui/reforgeWindow.js`.

## Honing and Dungeon Scrying

On identified, unequipped Magic, Rare, and Exalted Legendary gear, `honeableLines` lists rolled numeric affixes below their band maximum, excluding fixed record lines. `honeAffix` raises the chosen line directly to `band[1]` and increments `item.honed`. `honePrice` charges per point of gain via `HONE_PRICE_PER_POINT`: `2` shards and `300` gold (Magic), `3` shards and `800` gold (Rare), or `5` shards and `2,000` gold (Exalted).

On the `scry` page, players pick a dungeon family from `SCRY_FAMILIES` (`DUNGEON_KIND_WORDS`), with `scryWhere` (`src/scenes/world.js`) supplying regional locations and coordinates. Paying `SCRY_PRICE` (`3` shards and `500` gold) reveals the nearest undiscovered match via `discoverLocation` (`src/maps/discovery.js`) without changing drop odds; `'none'` is refused before payment.

## Gem Sockets and Extraction

In `rollLootRarity`, `socketPass` rolls `SOCKET_PER_MILLE` (`150` Rare, `300` Legendary) across `SOCKET_GROUPS` (weapons, armor, and jewelry, never garments), while `weaponSocketPass` rolls further weapon sockets after late finds. Items preserve both the legacy `socket` string and the `sockets` array (`src/items/itemFields.js`).

`setGemPiece` sockets a valid loose gem (`takeGem` and `looseGem` block quest, locked, worn, or enchanted gems) with no gold fee and refreshes worn stats. Gem lines have no roll band and skip reforge and honing. `unsetGemPiece` shatters the gem, whereas Reforge extraction charges `EXTRACT_PRICE` (`50` to `800` gold by grade) to recover it.
