---
slug: growth-tab-overview
title: "Growth Tab: Level, Specializations, Firmament, and Captain's Stars"
domain: ui
kind: overview
parent: null
files:
  - src/ui/growth/growthTab.js
  - src/ui/growth/growthPages.js
  - src/ui/enhancedMenu.js
  - src/ui/pauseDoor.js
  - src/ui/charsheet.js
routes: []
tables: []
replacesBible:
  - "10-UI/Growth.md"
related:
  - growth-level-page-and-bonus-pool
  - growth-stage-and-embedded-skies
  - growth-specialization-guide-and-reset
  - growth-class-skill-swap
  - holdings-tab-overview
  - captain-tree-and-ore-refits
  - ui-overlays-and-localization
invariants:
  - "`PAUSE_TABS` in `src/ui/enhancedMenu.js` holds the `'growth'` tab, and its rail pages follow `GROWTH_PAGE_SECTIONS` (`'level'`, `'specs'`, `'firmament'`, and `'captain'`)."
  - "`growthSections` omits `'captain'` unless `ctx.captain.stars` is a function; every other page always renders and states why when it has nothing to show."
  - "Both Growth and Crafting apply `px-win-growth` (`width: min(1320px, 96vw)`, `height: min(860px, 100dvh - 64px)`) so switching pages never resizes the window."
  - "`resetGrowthTab(at)` runs on mount to select the landing page, reset the specialization guide, and call `dropStage()`, while leaving the tab calls `releaseGrowthTab()`."
traps:
  - "Because the classic pause menu has no tabs, `src/ui/pauseDoor.js` opens the enhanced pause window on either skin whenever `growthPageAt(hooks.at)` returns true."
  - "Switching away from Growth queries `growthAsks()` first; when an active stage face holds unaccepted stars, the first tab switch is consumed to prompt the player."
dfu: []
tags:
  - growth
  - pause-menu
  - ui
  - specializations
  - firmament
---

# Growth Tab: Level, Specializations, Firmament, and Captain's Stars

The `growth` pause-menu tab (`PAUSE_TABS` in `src/ui/enhancedMenu.js` and `src/ui/growth/growthTab.js`) consolidates character advancement, Arcane and Martial specializations, the Firmament sky, and Captain's Stars into a single fixed-frame pane (`px-win-growth`, shared with the Crafting tab). Revenant stars remain on the Companions page (`openRevenantStars` and `revenantStarsOver` in `src/ui/pauseDoor.js`) rather than inside Growth.

## Rail Pages and Due Badges

`growthSections` (`src/ui/growth/growthTab.js`) builds the left rail from `GROWTH_PAGE_SECTIONS` (`src/ui/growth/growthPages.js`):

- `level`: pending level-up attribute distribution or a read-only character summary (`growth-level-page-and-bonus-pool`).
- `specs`: Arcane and Martial path checklists, path resets, and paid class skill swaps (`growth-specialization-guide-and-reset`, `growth-class-skill-swap`).
- `firmament`: embedded Firmament star sky (`growth-stage-and-embedded-skies`).
- `captain`: embedded Captain's Stars sky, shown only when `ctx.captain.stars` is a function.

`growthDue` computes the rail badge counts: an alert badge for a level owed, `1` per specialization family with an open path choice, unplaced Firmament stars and craft points, and unspent captain points.

## Landings and Lifecycle

`pauseDoor.js` routes `'growth'` or any section id (`growthPageAt(hooks.at)`) into the enhanced pause window on both enhanced and classic skins, while `SPEC_LANDINGS` maps `'specs:arcane'` and `'specs:martial'` from the classic character sheet's `S` and `W` rows (`src/ui/charsheet.js`). Mounting runs `resetGrowthTab(at)` and leaving runs `releaseGrowthTab()`, gated by `growthAsks()`.
