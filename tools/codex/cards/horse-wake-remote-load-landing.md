---
slug: horse-wake-remote-load-landing
title: "Remote Save-Load Horse Recall and elsewhere Restore Flag"
domain: travel
kind: overview
parent: null
files:
  - src/travel/horseCart.js
  - src/world/worldSaveLoad.js
  - src/player/deathRespawn.js
  - src/scenes/world.js
  - src/player/mountRig.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25e.md"
related:
  - wagons-kinds-and-hitching-overview
  - horse-care-keep-stables-and-yards
  - holdings-stable-and-transport-stabling
invariants:
  - "`restoreSaveData(data, { elsewhere = false })` (`src/travel/horseCart.js`) normalizes the saved record first and calls `callTeamToLanding` (`forceNextFastTravel`, `handlePreFastTravel`, `handlePostFastTravel`) only when `elsewhere` is `true`."
  - "`src/world/worldSaveLoad.js` passes `{ elsewhere: csaElsewhere }` when a load relocates the player away from the save spot (such as online underground wake in `src/player/deathRespawn.js`), bringing waiting horses or hitched teams to the landing."
  - "Standalone unhitched wagons and stabled teams remain where parked, and same-dungeon `horseCartLoad` (`src/scenes/world.js`) omits `elsewhere` so the horse stays at the dungeon door."
traps:
  - "Never pass `elsewhere: true` on same-location dungeon loads, and remember the forced fast-travel recall is one-shot at load time."
dfu: []
tags:
  - horses
  - wagons
  - save-load
  - online
---

# Remote Save-Load Horse Recall and elsewhere Restore Flag

`src/travel/horseCart.js` and `src/world/worldSaveLoad.js` recall a waiting horse or hitched team to the arrival landing whenever a save load relocates the player away from the original save position.

## Restore Flag and Landing Recall

- **One-shot fast-travel recall (`src/travel/horseCart.js`):** `restoreSaveData(data, { elsewhere = false })` normalizes the saved transport record first and runs `callTeamToLanding` (`forceNextFastTravel`, `handlePreFastTravel`, and `handlePostFastTravel`) only when `elsewhere` is `true`. While active, `src/player/mountRig.js` checks `canMountHorseFromTransportWindow()` before mounting from the transport window.
- **Relocated wake loads (`src/world/worldSaveLoad.js`, `src/player/deathRespawn.js`):** When a load moves the character away from the saved location, such as an online underground wake relocation in `src/player/deathRespawn.js`, `src/world/worldSaveLoad.js` passes `{ elsewhere: csaElsewhere }` so any waiting horse or hitched team travels to the new landing.

## Preserved Placements

- **Unhitched, stabled, and same-dungeon loads (`src/scenes/world.js`):** Standalone unhitched wagons and stabled teams stay where parked. In `src/scenes/world.js`, `horseCartLoad` calls `restoreSaveData` without `elsewhere` on same-location dungeon loads so the horse remains outside the dungeon door.
