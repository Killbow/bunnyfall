---
slug: ui-arc-enhanced-inventory-and-pack
title: "Inventory Session, Enhanced Pack Pages, and Paperdoll"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/items/inventorySession.js
  - src/items/itemTransfer.js
  - src/items/itemInfo.js
  - src/characters/equip.js
  - src/ui/enhancedInventory.js
  - src/ui/packPages.js
  - src/ui/paperDoll.js
  - src/ui/nativeInventory.js
  - src/ui/virtualRows.js
  - src/ui/textureCanvas.js
  - src/ui/landingTiles.js
routes: []
tables: []
replacesBible:
  - "10-UI/UI-Arc.md"
related:
  - items-gold-counter-and-wagon
  - characters-paperdoll-and-bodies
  - ui-arc-quickslot-diamond
invariants:
  - "Transfer planning (planStore, planTake, planDropGold, applyTransfer in src/items/itemTransfer.js) and session state (openState, remoteTarget, planWagonToggle, closeSession in src/items/inventorySession.js) are shared by classic and enhanced windows."
  - "PACK_PAGES (src/ui/packPages.js) partitions unequipped items across 9 pages, including Valuables, with no loss or duplication versus DFU's 4 tabs."
  - "PaperDollRenderer composites layers relative to PAPERDOLL_ORIGIN (200, 8)."
traps:
  - "Lists past VIRTUAL_MIN = 120 rows virtualize; measure spacers before restoring scroll or Chrome clamps it."
  - "Fitted icon cache is bounded by FIT_CACHE_MAX = 2000 and FIT_CACHE_BYTES = 12 MB (src/ui/textureCanvas.js)."
  - "Hover paths must ignore (-1, -1) off-panel sentinel coordinates so scrollbar drags do not snap to row 0."
dfu:
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallInventoryWindow.cs
tags:
  - inventory
  - paperdoll
  - loot
  - enhanced
  - virtualization
---

# Inventory Session, Enhanced Pack Pages, and Paperdoll

Classic and enhanced inventory windows share session state, transfer planning, item naming, and paperdoll compositing while adding nine pack pages and row virtualization to the enhanced view.

- **Shared Session and Transfer Model:** `openState`, `remoteTarget`, `planWagonToggle`, and `closeSession` in `src/items/inventorySession.js` pair with `planStore`, `planTake`, `planDropGold`, and `applyTransfer` in `src/items/itemTransfer.js`. `itemNameParts` and `itemLongName` in `src/items/itemInfo.js` resolve display names while `itemSaysMaterial` gates hidden material prefixes.
- **Pack Pages, Cards, and Paperdoll:** `PACK_PAGES` in `src/ui/packPages.js` partitions unequipped items into 9 pages, including Valuables. `src/ui/enhancedInventory.js` defines `localPrimaryAct`, `useResultAction`, `infoCard`, `fitCard`, and `CARD_FITS`. `src/ui/paperDoll.js` exports `refreshPaperDoll` and `preloadPaperDollForEntity`, compositing layers relative to `PAPERDOLL_ORIGIN` (`200, 8`).
- **Virtualization and Icon Caching:** Lists exceeding `VIRTUAL_MIN = 120` rows in `src/ui/virtualRows.js` virtualize and size spacers before scroll restoration. `src/ui/textureCanvas.js` caps fitted icons at `FIT_CACHE_MAX = 2000` and `FIT_CACHE_BYTES = 12 MB`, and `landingTiles` in `src/ui/landingTiles.js` batches cold icon decodes into one next-frame pass.
