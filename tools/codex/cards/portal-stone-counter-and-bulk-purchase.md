---
slug: "portal-stone-counter-and-bulk-purchase"
title: "Portal Stone Counter: Shop Rows and Bulk Shard Purchase"
domain: "economy"
kind: "subcard"
parent: "portal-stone-overview"
files:
  - "src/travel/portalCounter.js"
  - "src/travel/portalStone.js"
  - "src/trade/shopRows.js"
  - "src/trade/shopStock.js"
  - "src/scenes/worldModes.js"
  - "src/ui/merchantServiceWindow.js"
  - "src/ui/merchantRepairWindow.js"
  - "src/ui/merchantServiceDoor.js"
  - "src/ui/merchantRepairDoor.js"
  - "src/items/reforge.js"
  - "src/items/inventory.js"
  - "src/items/itemTransfer.js"
  - "src/items/loot.js"
  - "locales/en/Port_Strings.csv"
routes: []
tables: []
replacesBible:
  - "06-Systems/Portal-Stone.md"
related:
  - "portal-stone-overview"
  - "loot-arc-welkynd-salvage-reforge-and-imprint"
  - "market-vendors-and-professions"
invariants:
  - "`createShopRows` (built once by `createWorldModes`) adds a `portal` row only when `isShop(buildingType)` holds: Alchemist, Armorer, Bookseller, ClothingStore, FurnitureStore, GemStore, GeneralStore, PawnShop, WeaponSmith."
  - "Each stone costs `PORTAL_STONE_SHARDS = 5` Welkynd Shards with no bulk discount; stones are minted on sale (`portalStones(n)`), never drawn from shelf stock."
  - "`shardsHeld` counts only unlocked, unworn shards; `shardsKept` is the locked/worn remainder named in the refusal text."
  - "`portalStoneMax` = min(floor(`shardsHeld` / 5), `portalStoneRoom`), where room is `LOOT_STACK_MAX = 65535` minus the stack `findExistingStack` would merge into."
  - "`buyPortalStones(items, n)` is all-or-nothing: `portalStoneRefusal` returns `'count'`, `'shards'`, or `'stack'` with nothing taken; `buyPortalStone` is `buyPortalStones(items, 1)`."
traps:
  - "`portalCountField` seeds the quantity with `1` rather than the maximum so a stray Return cannot spend the shard stack."
  - "A locked stone stack never merges (`stacksWith` requires matching `locked`), so a purchase starts a fresh stack beside it."
  - "There is no carry-weight gate: a stone (0.25 kg) weighs less than its five shards (0.1 kg each)."
dfu: []
tags:
  - "portal-stone"
  - "shop"
  - "welkynd-shard"
  - "bulk-buy"
  - "counter"
---

# Portal Stone Counter: Shop Rows and Bulk Shard Purchase

Merchant counters offer Portal Stones through `src/travel/portalCounter.js` and `src/trade/shopRows.js`. Built once by `createWorldModes` (`src/scenes/worldModes.js`), `createShopRows` appends a `portal` service row whenever `isShop(buildingType)` matches `Alchemist`, `Armorer`, `Bookseller`, `ClothingStore`, `FurnitureStore`, `GemStore`, `GeneralStore`, `PawnShop`, or `WeaponSmith`. Classic merchant popups (`GNRC01I0` in `src/ui/merchantServiceWindow.js` and `REPR01I0` in `src/ui/merchantRepairWindow.js`) render the row via `drawPortalRow` at `portalRowRect` and bind `PORTAL_ROW_KEY = 'KeyP'`, while Enhanced Plus service doors insert a button immediately before Exit.

Each stone costs `PORTAL_STONE_SHARDS = 5` Welkynd Shards with no bulk discount and no carry-weight gate, as one 0.25 kg stone weighs less than five 0.1 kg shards. Stones are minted on purchase via `portalStones(n)` rather than pulled from shelf stock. `shardsHeld` tallies only unlocked, unworn shards, while `shardsKept` tracks locked or worn shards cited in refusal messages. Maximum purchase count `portalStoneMax` equals `min(floor(shardsHeld / 5), portalStoneRoom)`, where room subtracts any mergeable unlocked stack found by `findExistingStack` from `LOOT_STACK_MAX = 65535` (locked stone stacks never merge under `stacksWith`).

`portalCountField` seeds its input with `1` (validated by `parseSplitAmount` across `1..max`, or skipped when `max` is `1`) before showing the `portal.buy.ask` confirmation (`locales/en/Port_Strings.csv` also holds `portal.buy.bought` and `portal.buy.full`). `buyPortalStones(items, n)` and `buyPortalStone` execute all-or-nothing, aborting if `portalStoneRefusal` returns `'count'`, `'shards'`, or `'stack'`.
