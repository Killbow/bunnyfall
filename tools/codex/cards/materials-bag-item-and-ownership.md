---
slug: materials-bag-item-and-ownership
title: "The Bag Item: Template, Capacity, One-Bag Rule, Endless Shelf"
domain: economy
kind: subcard
parent: materials-bag-overview
files:
  - src/net/bagLaw.js
  - src/professions/materialsBag.js
  - src/items/itemTransfer.js
  - src/items/inventorySession.js
  - src/ui/enhancedInventory.js
  - src/ui/nativeInventory.js
  - src/trade/shopStock.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Materials-Bag.md"
related:
  - materials-bag-overview
  - materials-bag-harvest-routing-and-cooking
invariants:
  - "A bag is identified by `isBagItem`: `templateIndex === BAG_TEMPLATE` (`600`) and group `'UselessItems2'`. `BAG_ROW` has `hasNoEncumbrance: true`, is not stackable, and takes one slot."
  - "`BAG_KG_LIMIT` is `300` kg (two-fifths of the `750` kg DFU wagon)."
  - "Only items that `materialKeyOfItem` recognizes can enter the bag; it returns `null` for quest, summoned, equipped (`equipSlot`), enchanted, and rotting (`foodStage > 0`) items, and for anything the material mint does not produce, including gold (`bagStoreRefusal`)."
  - "One bag per character: `holdsOtherBag` checks the pack, the trade basket, and the wagon, while taking a bag out of your own wagon remains allowed."
  - "`bagMayLeave` is `false` while `bagItems` is non-empty, and every transfer, trade, and sale path enforces it (`bagLoaded`)."
traps:
  - "`REMOTE_TARGET_TYPES.Bag` is `4`. `planBagToggle` turns the wagon view off so the remote pane shows bag or wagon, never both, and refuses over a reward tray (`BAG_WORDS.reward`)."
  - "The bag is shelved on every General Store shelf and replenished by `restockEndless` only while `isOnlinePage()` is true; online, `shopBuysItem` refuses all endless-stock rows at every shop."
dfu:
  - ItemHelper.cs
tags:
  - materials-bag
  - inventory
  - shop
  - one-bag
  - endless-stock
---

# The Bag Item: Template, Capacity, One-Bag Rule, Endless Shelf

The physical Materials Bag (`src/net/bagLaw.js` and `src/professions/materialsBag.js`) is a zero-encumbrance container item (`BAG_TEMPLATE = 600` in group `'UselessItems2'`, checked by `isBagItem`) holding up to `BAG_KG_LIMIT = 300` kg of profession materials on `entity.bagItems`.

## Capacity, Admission Filter, and Inventory UI

`BAG_ROW` defines `hasNoEncumbrance: true`, single-slot occupancy, and `BAG_BASE_PRICE = 250` (about `500` gold on retail shelves under the DFU shop multiplier in `ItemHelper.cs`). `bagStoreRefusal` admits only items recognized by `materialKeyOfItem`, rejecting gold, non-minted items, quest items, summoned gear, equipped items (`equipSlot`), enchanted items, and spoiling food (`foodStage > 0`). If stored food rots inside, `emptyBagIntoPack` (on the Stores page or in `src/ui/enhancedInventory.js` and `src/ui/nativeInventory.js`) moves non-materials out first so a jammed bag can always be emptied.

In `src/items/inventorySession.js` and `src/scenes/worldModes.js`, `REMOTE_TARGET_TYPES.Bag` (`4`) shares the remote pane with the wagon: `planBagToggle` turns the wagon view off so only one remote container appears, and refuses over an active reward tray (`BAG_WORDS.reward`).

## One-Bag Rule, Non-Empty Lock, and Online Shop Stock

`holdsOtherBag` (`src/items/itemTransfer.js`) enforces one bag per character across the pack, trade basket, and wagon (retrieving your own bag from your wagon is allowed). While `entity.bagItems` is non-empty, `bagMayLeave` is `false` (`bagLoaded`), blocking drops, transfers, and sales.

While `isOnlinePage()` is true, `src/trade/shopStock.js` stocks the bag on every General Store shelf, refills purchases via `restockEndless`, and refuses buyback of all endless-stock rows (`shopBuysItem`).
