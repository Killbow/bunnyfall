---
slug: shared-room-loot-champion-base-overview
title: "Shared Room Loot Signatures and Champion Base Level"
domain: online-coop
kind: overview
parent: null
files:
  - src/items/roomLootHost.js
  - src/characters/champions.js
  - src/scenes/dungeonContext.js
  - src/items/loot.js
  - src/combat/hostCombat.js
  - src/characters/enemyEntity.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25b.md"
related:
  - shared-room-loot-stale-memory-restart
  - online-coop-shared-dungeon-and-interior-rooms
  - loot-arc-signature-drops-champions-and-drought
invariants:
  - "A room container whose received base signature `h` mismatches the local one enters `_lootUnreadable` and shows unreadable text instead of opening."
  - "`championTraitFor` returns null without a trait, below `CHAMPION_MIN_LEVEL` (3), on city watch or `PlayerAlly`, or with loot rarity off."
  - "`roomBodyBase` re-judges `f.src.champion` at `terms.lv` via `championTraitFor` while excluding `e.eliteFoe`, saving and restoring `lootCap`, `items`, `level`, and `champion` around base generation."
  - "Room bodies skip `raiseEnemyDeath` when `_roomBody` is truthy so death handlers never cap a room base."
traps:
  - "Unreadable marks persist for the visit; `forgetRoomContainer` does not clear them."
  - "Class enemies build at the local builder level (`makeEnemyEntity` via `buildFoeAt`), while `eliteLooted` in `hostCombat.js` skips plain-loot keep for champions."
dfu: []
tags:
  - party-loot
  - room-loot
  - champions
  - levels
---

# Shared Room Loot Signatures and Champion Base Level

Shared room containers in `src/items/roomLootHost.js` verify an incoming loot base signature `h` against the local roll. When `h` mismatches, the container marks `_lootUnreadable` for the visit (`forgetRoomContainer` does not clear it) and displays `LOOT_NEWER_TEXT` from `src/items/loot.js` instead of opening (`LOOT_STACK_MAX` is `65535`, and `validLootList` rejects gold piles above it).

## Level-Consistent Champion Evaluation

In `src/characters/champions.js`, `markDungeonChampions` promotes eligible layout enemies at `CHAMPION_PER_MILLE` (`70`), while `championTraitFor` returns `null` without a trait, below `CHAMPION_MIN_LEVEL` (`3`), on city watch or `PlayerAlly`, or with loot rarity disabled. Because class enemies initially build at the local builder level (`makeEnemyEntity` via `buildFoeAt` in `src/characters/enemyEntity.js`), peers on opposite sides of level `3` can disagree on local `champion` flags.

When generating a corpse base, `roomBodyBase` saves and restores `lootCap`, `items`, `level`, and `champion`, re-evaluating `f.src.champion` at `terms.lv` via `championTraitFor` while excluding `e.eliteFoe`. Room bodies skip `raiseEnemyDeath` when `_roomBody` is truthy so death handlers never cap a room base, and `eliteLooted` in `src/combat/hostCombat.js` skips plain-loot retention for champions.
