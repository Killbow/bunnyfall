---
slug: level-cap-45-and-latch-release
title: "Level Cap 45 and Cap Latch Release"
domain: characters
kind: subcard
parent: main-spine-jewel-kin-and-masteries-overview
files:
  - src/characters/levelCap.js
  - src/characters/advancement.js
  - src/characters/oblivionLeveling.js
  - src/characters/earnedLevel.js
  - src/saves/save.js
  - src/saves/realmCustoms.js
  - src/ui/charSheetDoor.js
  - src/ui/charsheet.js
  - src/ui/growth/growthTab.js
  - src/ui/levelUpView.js
  - src/items/artifactEffects.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26d.md"
related:
  - main-spine-jewel-kin-and-masteries-overview
  - growth-level-page-and-bonus-pool
invariants:
  - "LEVEL_CAP = 45. checkForLevelUp clamps calculatePlayerLevel to LEVEL_CAP. checkForVirtueLevelUp and commitVirtueLevelUp grant nothing once atLevelCap."
  - "releaseCapLatch clears readyToLevelUp, pendingLevel, and pendingBonusPool only when the entity is at the cap and oghmaLevelUp is false."
  - "releaseCapLatch runs on save load (save.js), in crossLeveling (realmCustoms.js), in both level checks, at the char sheet door, and at sheet rollout."
  - "save.js resets oghmaLevelUp to false on every load, so the Oghma Infinium latch never survives a restore."
traps:
  - "The cap never lowers a level: characters already above 45 keep their level and gain no more."
  - "OVERCAP_LEVEL_CAP (20, skillSoftcap.js) is the skill level-factor ceiling, not the character level cap."
dfu: []
tags:
  - level-cap
  - leveling
  - virtue
  - oghma
---

# Level Cap 45 and Cap Latch Release

Character progression enforces a hard ceiling at `LEVEL_CAP = 45` (`src/characters/levelCap.js`) across classic and Virtue advancement modes while preserving the Oghma Infinium bonus rollout (`src/items/artifactEffects.js`).

- **Cap enforcement (`src/characters/advancement.js`, `oblivionLeveling.js`, `earnedLevel.js`):** Unlike classic DFU (which has no character level cap and would otherwise reach level `47` with `3/2/1` masteries), `checkForLevelUp` clamps `calculatePlayerLevel` to `LEVEL_CAP` (`45`). In Virtue leveling, `checkForVirtueLevelUp` and `commitVirtueLevelUp` grant no further levels once `atLevelCap` is true. Characters already above level `45` keep their existing level without gaining more.
- **Latch cleanup (`releaseCapLatch`, `src/saves/save.js`, `src/saves/realmCustoms.js`):** When an entity is at `atLevelCap` and `oghmaLevelUp` is `false`, `releaseCapLatch` clears `readyToLevelUp`, `pendingLevel`, and `pendingBonusPool`. It runs on save load, inside `crossLeveling`, in both advancement checks, at `src/ui/charSheetDoor.js`, and on character sheet rollout (`src/ui/charsheet.js`). `save.js` also resets `oghmaLevelUp` to `false` on every load.
- **Growth and level-up UI (`src/ui/growth/growthTab.js`, `src/ui/levelUpView.js`):** Both views inspect `atLevelCap` and display `Highest level reached`.
