---
slug: slots-hotbar-status-overview
title: "Plus UI Slots, Hotbar, and Status Widget"
domain: ui
kind: overview
parent: null
files:
  - src/ui/iconFit.js
  - src/ui/enhancedHotbar.js
  - src/ui/hudStatus.js
  - src/ui/hudRenown.js
  - src/ui/enhancedHud.js
  - src/ui/enhancedInventory.js
routes: []
tables: []
replacesBible:
  - "10-UI/Slots-Hotbar-Status.md"
related:
  - slots-fit-law-and-slot-frame
  - hotbar-icons-item-slotting-and-key-gate
  - status-widget-tiles-and-renown-bar
  - ui-arc-overview
  - ui-arc-quickslot-diamond
  - ui-arc-enhanced-inventory-and-pack
invariants:
  - "The slot is the frame: the rarity border, glow, corner marks, and wear bar sit on the slot edge, never on a nested inner tile."
  - "Active effects live in the side status widget (`src/ui/hudStatus.js`), which frees the bottom column for a 20px Renown track with the XP numbers inside it."
traps:
  - "This arc refines the Enhanced Plus UI only; the classic HUD and DFU-style windows are untouched."
  - "Many arc notes cite `ui/enhanced/*` and `ui/hud/*` paths; the real files are flat under `src/ui/`."
dfu: []
tags:
  - ui
  - hud
  - hotbar
  - inventory
  - status
  - renown
---

# Plus UI Slots, Hotbar, and Status Widget

The Slots, Hotbar, and Status arc unifies item and spell presentation across the Enhanced Plus UI while leaving classic `320x200` windows untouched (see `ui-arc-overview`). All modules live flat under `src/ui/` rather than nested `ui/enhanced/*` or `ui/hud/*` directories.

## Four Core Strands and Follow-Up Passes

- **Sprite Fit Law and Slot Frame (`slots-fit-law-and-slot-frame`):** `src/ui/iconFit.js` trims transparent margins and fits item and spell sprites to canonical slot boxes in `src/ui/enhancedInventory.js`. The slot border itself carries rarity color, glow, corner marks, and wear bars without an inner sub-frame, and `AC-COMPARE` (`src/ui/armourCard.js`) weights seven-part armor averages.
- **Hotbar Icons, Slotting, and Key Gate (`hotbar-icons-item-slotting-and-key-gate`):** `src/ui/enhancedHotbar.js` renders fitted spell and item faces, supports hover-plus-key assignment from the pack and spellbook, defaults `DIAMOND-HB` (`quickbarStyle`) to the 10-slot bar alongside the 4-slot diamond (`ui-arc-quickslot-diamond`), and readies free lycanthropy transforms (`HB-LYCFREE`).
- **Status Widget and Renown XP Track (`status-widget-tiles-and-renown-bar`):** Moving active effects into the side status widget (`src/ui/hudStatus.js`), including the unnamed `DISEASE-UNWELL` incubation tile, clears the bottom HUD column in `src/ui/enhancedHud.js` for a 20px Renown bar (`src/ui/hudRenown.js`) with inline XP progress.
