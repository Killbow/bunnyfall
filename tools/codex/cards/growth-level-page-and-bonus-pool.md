---
slug: growth-level-page-and-bonus-pool
title: "Growth Level Page, Pane Door, and the Once-per-Level Bonus Pool"
domain: ui
kind: subcard
parent: growth-tab-overview
files:
  - src/ui/growth/growthTab.js
  - src/ui/charSheetDoor.js
  - src/ui/enhancedLevelUp.js
  - src/ui/levelUpView.js
  - src/characters/advancement.js
  - src/ui/charsheet.js
routes: []
tables: []
replacesBible:
  - "10-UI/Growth.md"
related:
  - growth-tab-overview
  - growth-stage-and-embedded-skies
  - realm-saves-and-mod-save-hooks
invariants:
  - "`bonusPoolFor` (`src/characters/advancement.js`) rolls once per pending level and persists the integer on `entity.pendingBonusPool` across saves until `pendingLevel` clears via `applyLevelUp`, the Oghma Infinium flow, or the level cap."
  - "In online realm play, `bonusPoolFor` returns the fixed `ONLINE_BONUS_POOL` mean without rolling random dice."
  - "When a level is owed, the Level page mounts `hooks.ascendScreen` (`levelUpScreenFor` in `src/ui/charSheetDoor.js`); otherwise it mounts `viewOnlyScreen` (`src/ui/levelUpView.js`) with an empty bonus pool and a hidden OK button."
traps:
  - "`LEVEL_PANE_MIN_H` is `1000`: when `window.innerHeight < 1000` or the Grimoire dress is active, the Level page renders a summary card with an Open button that launches full-screen Ascension rather than embedding the rollout in the pane."
  - "The classic character sheet blocks opening the Growth guide while its own attribute rollout is active (`_growth` in `src/ui/charsheet.js`)."
  - "Closing the Level page mid-allocation preserves the owed level and `entity.pendingBonusPool`, but per-attribute point allocations in progress are not persisted."
dfu:
  - FormulaHelper.cs
  - StatsRollout.cs
tags:
  - growth
  - level-up
  - ascension
  - bonus-pool
---

# Growth Level Page, Pane Door, and the Once-per-Level Bonus Pool

The Growth `level` page (`src/ui/growth/growthTab.js`) hosts character attribute advancement and read-only stat inspection while preventing players from rerolling bonus attribute points by closing and reopening the level-up window.

## Persistent Once-per-Level Bonus Pool

In Daggerfall Unity (`FormulaHelper.cs` and `StatsRollout.cs`), opening the level-up rollout draws a fresh bonus pool each time. In the port, `bonusPoolFor` (`src/characters/advancement.js`) draws the pool once and stores it in `entity.pendingBonusPool`, which serializes with the character save (`realm-saves-and-mod-save-hooks`). Online characters receive the deterministic `ONLINE_BONUS_POOL` constant instead of a random draw.

When the player confirms attribute distribution, `applyLevelUp(entity, distribute, rolls, prerolledPool)` (`src/characters/advancement.js`, called by `src/ui/enhancedLevelUp.js`) consumes the displayed pool and clears both `pendingLevel` and `entity.pendingBonusPool` alongside the Oghma Infinium path and level-cap checks.

## Stage Key and Pane Door Fallback

The Level page mounts its face on the shared Growth stage (`growth-stage-and-embedded-skies`) under the key `level:owed` or `level:view:<level>`, forcing a clean remount as soon as a pending level is spent.

- **Owed level (`level:owed`):** delegates to `hooks.ascendScreen` (`levelUpScreenFor` in `src/ui/charSheetDoor.js`). When `window.innerHeight` is below `LEVEL_PANE_MIN_H` (`1000`) or the Grimoire theme is active, the pane displays a door card whose Open button launches the Ascension screen full-screen.
- **No level owed (`level:view:<level>`):** embeds `viewOnlyScreen` (`src/ui/levelUpView.js`) with a zero pool and its OK button hidden.
