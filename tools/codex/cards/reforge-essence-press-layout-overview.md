---
slug: reforge-essence-press-layout-overview
title: "Essence Reforge Multi-Press Layout and Smelt Grid Tracks"
domain: ui
kind: overview
parent: null
files:
  - src/ui/profPages.js
  - src/ui/enhancedPlusStyle.js
  - src/ui/reforgeWindow.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-17.md"
related:
  - weir-key-headless-law-row-and-lift
  - market-vendors-and-professions
  - professions-arc-overview
invariants:
  - "In `PROF_CSS` (`src/ui/enhancedPlusStyle.js`), `.prof-smelt .act` stays pinned to `grid-column: 3` and `grid-row: 1`, so multi-button reforge actions must never append directly into `.prof-smelt`."
  - "`drawEssenceReforge` (`src/ui/profPages.js`) groups press rows inside `.prof-smelt > .prof-lines` spanning `grid-column: 1 / -1` with `flex-direction: column`."
  - "`.prof-short` shortage warnings sit explicitly below their action line rather than flowing into the count column, and `src/ui/reforgeWindow.js` renders `.reforge-line` rows through `affixLine`."
  - "Replacement choices come from `reforgeChoices` (`src/items/lootRarity.js`): the item's group and number-or-proc class, minus the line's own kind and any kind or param another line holds. Pools are per item and line, never per line category; `tools/essenceReforgePools.test.mjs` pins this."
  - "`upgradeSelect` (`src/ui/upgradeSelect.js`) is an in-window scrolling list (`.choice-list`, max-height 220px, own scroll) with a select-like `.value`, `.onchange` and `.disabled`. It is not a native select."
traps:
  - "A native `<select>` popup is clipped by the desktop app window, and a `size > 1` listbox inside the scrolling pane swallows the wheel, so long pools looked cut off. Do not bring either back."
  - "Appending multiple reforge buttons directly into `.prof-smelt` stacks them in cell `(3, 1)` and collapses the item name column to `0` px."
dfu: []
tags:
  - professions
  - reforge
  - ui
  - css
---

# Essence Reforge Layout and Pickers

Reforge with Essence is a Bunnyfall station screen (`src/ui/profPages.js` `drawEssenceReforge`, `src/ui/enhancedPlusStyle.js`, `src/ui/reforgeWindow.js`).

## Layout

- `.prof-smelt .act` stays pinned to grid cell `(3, 1)`, so a piece's presses live in `.prof-smelt > .prof-lines` (full width, a column), never straight in the grid.
- `.prof-short` warnings span the row under their line.

## Pools and pickers

- `reforgeChoices` (`src/items/lootRarity.js`) gives a line its replacements: the item's group and number-or-proc class, minus the line's own kind and any kind or param another line holds. Pools follow the item and the line, not the line's category. `tools/essenceReforgePools.test.mjs` pins this.
- `upgradeSelect` (`src/ui/upgradeSelect.js`) is an in-window list (`.choice-list`, 220px, scrolls on its own) with a select-like `.value`, `.onchange` and `.disabled`.
- Do not bring back a native `<select>` (the desktop app clips its popup) or a `size > 1` listbox in the pane (it swallows the wheel). Long pools looked cut off.
