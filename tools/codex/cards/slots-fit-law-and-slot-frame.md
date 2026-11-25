---
slug: slots-fit-law-and-slot-frame
title: "Sprite Fit Law, Slot Boxes, and Armor Plaque"
domain: ui
kind: subcard
parent: slots-hotbar-status-overview
files:
  - src/ui/iconFit.js
  - src/ui/bitmapCanvas.js
  - src/ui/textureCanvas.js
  - src/ui/enhancedInventory.js
  - src/ui/enhancedStyle.js
  - src/ui/armourCard.js
  - src/combat/formulas.js
routes: []
tables: []
replacesBible:
  - "10-UI/Slots-Hotbar-Status.md"
related:
  - slots-hotbar-status-overview
  - ui-arc-enhanced-inventory-and-pack
  - hotbar-icons-item-slotting-and-key-gate
invariants:
  - "`fitIcon` trims transparent margins first (`opaqueBounds`, alpha > `TRIM_ALPHA = 8` in `src/ui/bitmapCanvas.js` `fitCanvas`), then scales the longest side to the box in device pixels."
  - "`clampDpr` keeps the ratio in `[0.5, 8]`; `ICON_CAP = 4` CSS px per source px; a whole-number scale is taken when it keeps at least `SNAP = 0.75` of the size."
  - "A scale above `1` that is not whole uses sharp bilinear scaling (nearest-neighbor prescale, then a smooth resample); a scale below `1` uses a smooth reduction, never pixelated."
traps:
  - "`SLOT_BOX` is a frozen JS constant, not a table: `grid: 48`, `gridPhone: 40`, `worn: 28`, `wornHalf: 22`, `wornWide: 48`, `wornHalfWide: 38`, `loot: 30`, `row: 26`, `socket: 32`, `card: 96`, and `broker: 32`."
  - "Phone and wide boxes switch on `PHONE_QUERY` (`max-width: 640px`) and `WIDE_QUERY` (`min-width: 1000px`); Node has no `matchMedia` and reads as desktop or not-wide."
  - "The fitted cache (`FIT_CACHE_MAX = 2000`, `FIT_CACHE_BYTES = 12` MB, LRU) must be dropped when texture mods change."
dfu: []
tags:
  - icons
  - fit-law
  - inventory
  - rarity-frame
  - armor
---

# Sprite Fit Law, Slot Boxes, and Armor Plaque

`src/ui/iconFit.js` and `src/ui/bitmapCanvas.js` standardize how item and spell sprites fit into Enhanced Plus UI slots (`src/ui/enhancedInventory.js`, `src/ui/enhancedStyle.js`).

## Margin Trimming, Scaling, and Slot Boxes

`fitCanvas` (`src/ui/bitmapCanvas.js`) finds `opaqueBounds` using alpha above `TRIM_ALPHA = 8`, and `fitIcon` (`src/ui/iconFit.js`) scales the longest trimmed edge to the target box in device pixels (`clampDpr` in `[0.5, 8]`, capped at `ICON_CAP = 4` CSS pixels per source pixel). Whole-number multiples snap whenever they preserve at least `SNAP = 0.75` of the target dimension; non-integer upscales use sharp bilinear filtering, while downscales use smooth reduction.

`SLOT_BOX` defines canonical CSS pixel sizes: `grid: 48`, `gridPhone: 40`, `worn: 28`, `wornHalf: 22`, `wornWide: 48`, `wornHalfWide: 38`, `loot: 30`, `row: 26`, `socket: 32`, `card: 96`, and `broker: 32`. Viewport responsive helpers check `PHONE_QUERY` (`max-width: 640px`) and `WIDE_QUERY` (`min-width: 1000px`), defaulting to desktop and non-wide in Node where `matchMedia` is absent. `requestFittedIcon` (`src/ui/textureCanvas.js`) caches results in an LRU store (`FIT_CACHE_MAX = 2000`, `FIT_CACHE_BYTES = 12` MB) rendered by `fittedImg` and flushed whenever texture mods change.

## Weighted Armor Plaque Comparison

In `src/ui/armourCard.js`, the armor plaque weights average protection across all seven body parts by `struckBodyPartTable()` (`src/combat/formulas.js`), respecting combat-overhaul overrides. Unidentified items compare using only card-visible stats without hidden affixes.
