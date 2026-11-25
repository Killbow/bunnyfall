---
slug: gem-sockets-setting-shattering-and-extraction
title: "Setting, Shattering, Extraction, and Socket Wells"
domain: items
kind: subcard
parent: gem-sockets-overview
files:
  - src/items/reforge.js
  - src/items/lootRarity.js
  - src/ui/socketWells.js
  - src/ui/enhancedInventory.js
  - src/ui/reforgeWindow.js
  - src/scenes/worldModes.js
  - src/trade/tradeModes.js
  - src/items/itemFields.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gem-Sockets.md"
related:
  - gem-sockets-overview
  - loot-ii-reforge-honing-scry-and-sockets
  - loot-arc-welkynd-salvage-reforge-and-imprint
  - economy-ledger-and-item-judge
invariants:
  - "`setGemPiece` sockets a loose gem into an empty slot at no gold cost via `takeGem` and `looseGem` (which reject quest, locked, equipped, or enchanted stones), returning `'set'` through `setGemRefusal` if the target slot is already occupied."
  - "`unsetGemPiece` shatters an occupied socket's gem for free and leaves the slot empty, whereas `extractGemPiece` at the Mages Guild Reforge recovers the gem intact for `EXTRACT_PRICE` (`50`, `100`, `200`, `400`, or `800` gold from chipped to perfect)."
  - "`socketWork` returns `'off'`, `'not'`, or `'unknown'` on invalid requests, allows socketing on currently equipped gear, and invokes `refold` to recompute wearer stats immediately."
  - "`gemPieceCap` clamps the combined total of same-kind, same-parameter gem lines on one item to the top of that stat's Rare affix band during `readLines`, and `gemCapLine` displays an indicator when the cap is active."
  - "`setGem` and `unsetGem` adjust `item.value` by the gem's base worth (`gemWorth`) rather than affix value, while items still carrying the legacy single-socket `socket` string field deduct the legacy affix line worth on removal."
traps:
  - "`salvageRefusal` returns `'gems'` for any item holding a socketed gem, causing single and batch Welkynd Shard salvage to skip socketed pieces until their gems are shattered or extracted."
  - "`socketBought` pairs preserve merchant counter purchase prices across gem setting, `tradeCost` resale math, and Reforge extraction."
dfu: []
tags:
  - sockets
  - reforge
  - ui
  - salvage
  - economy
---

# Setting, Shattering, Extraction, and Socket Wells

Gem setting, shattering, Reforge extraction, stat capping, and socket UI live in `src/items/reforge.js`, `src/items/lootRarity.js`, `src/ui/socketWells.js`, `src/ui/enhancedInventory.js`, and `src/ui/reforgeWindow.js`.

## Setting, Shattering, and Extraction

`socketWork` rejects invalid targets with `'off'`, `'not'`, or `'unknown'`, allows modifying equipped gear, and calls `refold` (`src/scenes/worldModes.js`) to refresh wearer stats immediately:

- **Setting (`setGemPiece`):** Free of gold cost. Consumes one loose gem via `takeGem` and `looseGem` (blocking quest, locked, worn, or enchanted stones) into an empty slot. Occupied slots return `'set'` via `setGemRefusal` and are never overwritten.
- **Shattering (`unsetGemPiece`):** Destroys an occupied slot's gem for free and clears the slot to `'empty'`.
- **Extraction (`extractGemPiece`):** At the Mages Guild Reforge, charges `EXTRACT_PRICE` (`50`, `100`, `200`, `400`, or `800` gold from chipped to perfect) to recover the gem intact.

## Stat Caps, Valuation, and Socket Wells

When multiple gems share a kind and parameter on one piece, `gemPieceCap` (`readLines`) caps their sum at the top of that stat's Rare band, and `gemCapLine` flags the cap. `setGem` and `unsetGem` shift `item.value` by `gemWorth` (items using the legacy single-socket `socket` string field deduct line worth instead), while `socketBought` tracks shop-bought gem prices across `tradeCost` (`src/trade/tradeModes.js`) and extraction. `salvageRefusal` returns `'gems'` for any gem-set item so salvage skips it.

`socketWells` draws each slot with a `GEM_GRADE_COLOURS` ring, and `markSocketFrame` adds tile pips. Pressing an empty well opens `socketChooser`; pressing a set well arms `wellAsk` (`UNSET_ASK`) and shatters on the second press. Switching items (`wellPick`) resets `wellOpen` and `wellAsk`.
