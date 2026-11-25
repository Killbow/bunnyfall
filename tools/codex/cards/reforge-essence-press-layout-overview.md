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
traps:
  - "Appending multiple reforge buttons directly into `.prof-smelt` stacks them in cell `(3, 1)` and collapses the item name column to `0` px."
dfu: []
tags:
  - professions
  - reforge
  - ui
  - css
---

# Essence Reforge Multi-Press Layout and Smelt Grid Tracks

Reforge with Essence is a Bunnyfall profession station screen with no classic Daggerfall counterpart, implemented across `src/ui/profPages.js`, `src/ui/enhancedPlusStyle.js`, and `src/ui/reforgeWindow.js`.

## Smelt Grid Action Pinning (`PROF_CSS`)

- **Fixed action cell:** In `PROF_CSS` (`src/ui/enhancedPlusStyle.js`), `.prof-smelt .act` stays pinned to `grid-column: 3` and `grid-row: 1`. Because of this track pinning, multi-button reforge actions must never append directly into `.prof-smelt`; doing so stacks every button inside cell `(3, 1)` and collapses the item name column to `0` px.
- **Full-width line container:** To prevent track collisions, `drawEssenceReforge` (`src/ui/profPages.js`) wraps press rows inside `.prof-smelt > .prof-lines`, which spans `grid-column: 1 / -1` and stacks each action row vertically using `flex-direction: column`.

## Shortage Warnings and Affix Lines

- **Shortage placement:** Any `.prof-short` shortage warning renders explicitly below its corresponding action line inside the column layout rather than flowing horizontally into the count column.
- **Reforge window rows:** In `src/ui/reforgeWindow.js`, individual `.reforge-line` rows render through `affixLine` to keep affix previews aligned with the station press controls.
