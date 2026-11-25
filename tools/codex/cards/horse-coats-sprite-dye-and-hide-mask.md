---
slug: horse-coats-sprite-dye-and-hide-mask
title: "Horse Coats: Sprite Dye, Hide Mask, Markings, and Look Caches"
domain: rendering
kind: subcard
parent: horse-coats-overview
files:
  - src/travel/horseCoats.js
  - src/travel/riding.js
  - src/travel/horseCartPool.js
  - src/player/eotbSprite.js
  - src/player/eotbBody.js
  - src/net/peerRiders.js
  - src/formats/color32Order.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Coats.md"
related:
  - horse-coats-overview
  - horse-coats-3d-courser-and-saddle
  - horse-teams-pose-cadence-and-dye-budget
invariants:
  - "isCoatPixel: hue <= 50 or >= 345 with saturation >= 0.2, minus tack leather (hue 28-48, sat 0.36-<0.58, value 0.24-<0.5) when tack is true."
  - "Regions are 8-connected; dyed when >= COAT_REGION_SHARE = 0.03 of the largest, or shadow (mean value < COAT_SHADOW_VALUE = 0.3) within COAT_SHADOW_REACH = 2 px."
  - "White markings: 0.4 + 0.85 * max(v, whiteFloor); socks/stockings climb LEG_BANDS [0, 0.1, 0.2] of hide height."
  - "HORSE_LOOKS_KEPT = 16, HORSE_DYE_PICTURES = 5 per frame (_dyeBudget), RIDER_LOOKS_KEPT = 12, HORSE_PRELOAD_A_FRAME = 3."
traps:
  - "hideOf caches hide masks in a WeakMap keyed by the pixel array (_hides); a new array re-detects."
  - "Riding sprite records key as ride:<file>:<frame> plus lookSuffix (~<code>, empty for bay)."
  - "`rgbInto` wraps hue into `[0, 360)` before conversion."
dfu: []
tags:
  - horses
  - dye
  - sprites
  - cache
  - markings
---

# Horse Coats: Sprite Dye, Hide Mask, Markings, and Look Caches

`src/travel/horseCoats.js` recolors 2D riding, wagon, and peer rider sprites (`src/travel/riding.js`, `src/travel/horseCartPool.js`, `src/player/eotbSprite.js`, `src/player/eotbBody.js`, and `src/net/peerRiders.js`) through cached hide masks and bounded per-frame dye budgets.

## Hide Mask Detection and Coat Recoloring

- **Hide mask (`hideOf`):** `isCoatPixel` selects pixels with hue `<= 50` or `>= 345` and saturation `>= 0.2`, excluding tack leather (hue `28-48`, saturation `0.36-<0.58`, and value `0.24-<0.5`) when `tack` is true. Eight-connected regions join the mask when they reach `COAT_REGION_SHARE = 0.03` of the largest region, or when a dark region (mean value `< COAT_SHADOW_VALUE = 0.3`) sits within `COAT_SHADOW_REACH = 2` px. `hideOf` caches masks in the `_hides` `WeakMap` keyed by pixel array reference.
- **Dyes and markings (`recolorHorse`):** Code `0` returns the base image untouched. Non-bay codes map through `COAT_DYES` (hue, relative saturation, and `lift + scale * v`), while `rgbInto` wraps hue into `[0, 360)`. `markingAt` projects patterns across `max(PATTERN_SCALE_PX = 100, hide width)` using domain warp, `nearest2` lattices, and seed hashes. White markings compute `0.4 + 0.85 * max(v, whiteFloor)`, and socks or stockings climb `LEG_BANDS` (`[0, 0.1, 0.2]` of hide height).

## Look Caches and Frame Budgets

Caches retain `HORSE_LOOKS_KEPT = 16` horse looks and `RIDER_LOOKS_KEPT = 12` rider looks, dyeing at most `HORSE_DYE_PICTURES = 5` pictures per frame (`_dyeBudget`) and preloading `HORSE_PRELOAD_A_FRAME = 3`. Riding sprites key as `ride:<file>:<frame>` plus `lookSuffix` (`~<code>`, or empty for bay).
