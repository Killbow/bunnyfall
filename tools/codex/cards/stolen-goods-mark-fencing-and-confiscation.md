---
slug: stolen-goods-mark-fencing-and-confiscation
title: "Stolen Goods: The Theft Mark, No Restock, and Court Confiscation"
domain: economy
kind: subcard
parent: theft-law-indoor-watch-and-door-tokens-overview
files:
  - src/justice/stolenGoods.js
  - src/items/itemFields.js
  - src/items/inventory.js
  - src/items/itemTransfer.js
  - src/items/inventorySession.js
  - src/justice/court.js
  - src/justice/arrestFlow.js
  - src/trade/tradeModes.js
  - src/net/patronLaw.js
  - src/systems/naval/navalHost.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-16b.md"
related:
  - theft-law-indoor-watch-and-door-tokens-overview
  - economy-ledger-and-item-judge
  - materials-bag-item-and-ownership
  - naval-plunder-prize-deeds-and-raid-gate
  - town-economy-resale-cap-and-sea-trade
invariants:
  - "`stolen: true` (`STOLEN_MARK`, declared in src/items/itemFields.js) rides the save, the wire and realm trades."
  - "`stacksWith` requires `isStolen(a) === isStolen(b)`; `splitStack` re-marks the picked part with `markStolen`."
  - "The mark is written before the item lands (`applyTransfer` with `stolenFrom`), because an addItem merge would otherwise swallow it."
  - "`landSold` removes a sold stolen piece from play; only honest pieces land on the shelf."
  - "`confiscateStolen` takes every stolen piece from `items` and `bagItems` (unequipping it and putting out a lit torch); if no bag is left, the honest bag contents go into the pack."
  - "`patronTakes` refuses stolen items; a counter purchase clears the mark (`clearStolen` in src/trade/tradeModes.js)."
traps:
  - "Marking at window close (a diff) loses the mark when the item merges into an existing stack."
  - "An honest piece put into a stranger's cupboard and taken back is checked against the keeping set (`takenFromKeeping`, `returnedToKeeping`); it must not come back stolen."
  - "Lawful ships' holds and casks (`lawfulGoods`, `stolenCasks`) are stolen; pirate ships and ships beyond the Veil (`entry.ether`) are fair prize."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallTradeWindow.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallCourtWindow.cs
tags:
  - stolen-goods
  - theft
  - court
  - confiscation
  - fence
  - piracy
---

# Stolen Goods: The Theft Mark, No Restock, and Court Confiscation

Unlike DFU, where items carry no theft state and courts never seize inventory, Bunnyfall persists `stolen: true` (`STOLEN_MARK` in `src/items/itemFields.js`) across saves, wire frames, and realm trades.

- **Acquisition and stack hygiene:** Items receive the theft mark from shop stealing, closed shop shelves, containers belonging to strangers, robbed caravans (`theftTarget` and `loot.stolenFrom` in `src/scenes/worldModes.js`), and lawful ship holds (`winBoarding`, `lawfulGoods`, and `stolenCasks` in `src/systems/naval/navalHost.js`, whereas pirate ships and vessels with `entry.ether` are fair prize). In `src/items/itemTransfer.js` and `src/items/inventorySession.js`, `applyTransfer` stamps `stolenFrom` before `addItem` runs so stack merges cannot erase the mark, while `takenFromKeeping` and `returnedToKeeping` prevent an honest item temporarily placed into an external container from returning as stolen. In `src/items/inventory.js`, `stacksWith` requires `isStolen(a) === isStolen(b)`, and `splitStack` re-applies `markStolen` to split portions.
- **Trading and fencing:** In `src/trade/tradeModes.js`, `landSold` destroys sold stolen items instead of placing them onto the merchant shelf, while buying over the counter clears any mark via `clearStolen`. In `src/net/patronLaw.js`, `patronTakes` rejects stolen goods outright.
- **Court confiscation:** At every guilty outcome in `src/justice/court.js` and `src/justice/arrestFlow.js` (skipped on acquittal or guild rescue), `confiscateStolen` in `src/justice/stolenGoods.js` strips all stolen items from personal `items` and `bagItems`, unequips worn contraband, extinguishes a confiscated lit torch, and spills remaining honest bag items into the pack if the bag itself was stolen. Wagon and home storage are left untouched.
