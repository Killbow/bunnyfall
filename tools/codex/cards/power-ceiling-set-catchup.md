---
slug: power-ceiling-set-catchup
title: "Sigil Set Catch-Up Multiplier and SigilSetReach Save Vendor"
domain: items
kind: subcard
parent: power-ceiling-overview
files:
  - src/items/setReach.js
  - src/items/sigilSets.js
  - src/net/onlineWorld.js
  - src/saves/modSaveData.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Power-Ceiling.md"
related:
  - power-ceiling-overview
  - aetheric-sets-and-set-powers
  - sigil-sets-overview
invariants:
  - "`CATCH_UP_MULT = 3` (`src/items/setReach.js`) grants `3x` Renown XP via `catchUpXp` (`drinkWorn` in `src/items/sigilSets.js`) while a piece sits below the highest stage previously reached for that set, reverting to `1x` at or above recorded reach."
  - "Recorded set stages persist under mod save vendor `SigilSetReach` (`SET_REACH_SAVE_VENDOR` in `src/saves/modSaveData.js`) without bumping `SAVE_VERSION`."
traps:
  - "`sigilDrinks` runs in `src/net/onlineWorld.js`; offline play awards no Renown XP and never advances `drinkWorn`."
dfu: []
tags:
  - power-ceiling
  - sigil
  - sets
  - renown
---

# Sigil Set Catch-Up Multiplier and SigilSetReach Save Vendor

`src/items/setReach.js` accelerates replacement sigil set pieces up to the previously recorded stage high-water mark for each set without raising the horizontal power ceiling (`src/items/sigilSets.js`, `src/net/onlineWorld.js`, `src/saves/modSaveData.js`).

- **Catch-Up Multiplier and Threshold Clamping (`src/items/setReach.js`, `src/items/sigilSets.js`):** When a player replaces a worn set piece with a freshly dropped piece, `catchUpXp` applies `CATCH_UP_MULT = 3` during `drinkWorn` while the piece sits below the recorded stage reach for that set. Once the piece reaches or exceeds that recorded stage threshold, XP gain reverts to `1x`. Catch-up state also exposes the current stage, stage name, and active multiplier (`3x` or `1x`) for set tooltip cards. For set piece slot counting, `REACH_PIECES`, and five-stage Renown thresholds, see `sigil-sets-overview` and `sigil-set-pieces-tiers-and-stage-growth`.
- **Online Routing and Mod Save Persistence (`src/net/onlineWorld.js`, `src/saves/modSaveData.js`):** Renown XP ticks flow through `sigilDrinks` in `src/net/onlineWorld.js`, which calls `drinkWorn` only during online play; offline sessions award no Renown XP and never advance set piece stages. High-water set stages persist across sessions under the mod save vendor key `SigilSetReach` (`SET_REACH_SAVE_VENDOR` in `src/saves/modSaveData.js`), avoiding any change to the core save schema or `SAVE_VERSION`.
