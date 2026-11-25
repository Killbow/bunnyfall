---
slug: status-widget-tiles-and-renown-bar
title: "Status Widget Tiles, Unwell Incubation, and Renown XP Bar"
domain: ui
kind: subcard
parent: slots-hotbar-status-overview
files:
  - src/ui/hudStatus.js
  - src/ui/hudActiveSpells.js
  - src/ui/healthStatus.js
  - src/afflictions/diseases.js
  - src/ui/hudRenown.js
  - src/ui/enhancedHud.js
  - src/ui/enhancedStyle.js
routes: []
tables: []
replacesBible:
  - "10-UI/Slots-Hotbar-Status.md"
related:
  - slots-hotbar-status-overview
  - hotbar-icons-item-slotting-and-key-gate
  - event-board-hud-overview
invariants:
  - "`statusTiles` order: zone, event rules, spells, set powers, afflictions, needs (boons are needs at level `'boon'`), then the rested tile."
  - "Tiles use `STAT_TILE = 36` with a `STAT_PIC = 32` picture; the widget stays `STAT_MIDDLE_CLEAR = 24` px short of the screen middle, and overflow folds into a `'+N'` tile."
  - "Any disease still incubating shows one unnamed tile (`UNWELL_TILE_TEXT` `'Unwell'`, disease glyph), and the status box says `'You feel unwell.'` once (`UNWELL_LINE_TEXT`)."
traps:
  - "The `'Unwell'` tile is a deliberate departure from DFU, which shows nothing until the first symptom day; poison folds into one `'Poisoned'` tile."
  - "A spell blinks under 2 rounds left (`BLINK_INTERVAL = 0.25` s); held magic on an item never blinks and shows no rounds."
  - "The needs foot shows `tier/of` (such as `2/3`), and the level of a need goes in `say` because frame color alone was ambiguous."
dfu: []
tags:
  - status
  - buffs
  - debuffs
  - disease
  - renown
  - xp
---

# Status Widget Tiles, Unwell Incubation, and Renown XP Bar

`src/ui/hudStatus.js` consolidates active buffs, debuffs, and survival states into a square-tile side band, freeing the bottom HUD column in `src/ui/enhancedHud.js` for the Renown XP bar (`src/ui/hudRenown.js`).

## Status Tile Ordering, Layout, and Incubation

`statusTiles` (`src/ui/hudStatus.js`) pushes `36px` square tiles (`STAT_TILE = 36` housing a `STAT_PIC = 32` icon) in strict order:
1. Zone modifiers (`WILD1`) and active event rules (`event-board-hud-overview`).
2. Active spell rounds (`src/ui/hudActiveSpells.js`), which blink at `BLINK_INTERVAL = 0.25` s when below 2 rounds remaining; held item magic omits round counts and never blinks.
3. Armor set powers from `setHudChips`.
4. Afflictions (`src/ui/healthStatus.js`, `DISEASE_NAMES` in `src/afflictions/diseases.js`): active poisons collapse into a single `'Poisoned'` tile, while any incubating disease shows one unnamed `'Unwell'` tile (`UNWELL_TILE_TEXT`) and appends `'You feel unwell.'` (`UNWELL_LINE_TEXT`) once in the status dialog.
5. Survival needs and boons (`level: 'boon'`) from `survivalHudChips`, rendering `tier/of` in the tile footer and explicit severity text in `say`.
6. The rested indicator tile.

The band stops `STAT_MIDDLE_CLEAR = 24` px clear of the viewport center and collapses excess entries into a `'+N'` summary tile.

## Renown XP Track

`.hud-renowntrack` (`src/ui/enhancedStyle.js`) matches the `20px` height of the vitals bars, and `renownHudView` (`src/ui/hudRenown.js`) prints `'into / need XP'` inside the fill or `RENOWN_HUD_TOP` (`'Highest'`) at cap.
