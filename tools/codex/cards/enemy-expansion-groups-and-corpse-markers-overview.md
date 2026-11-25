---
slug: "enemy-expansion-groups-and-corpse-markers-overview"
title: "Enemy Expansion Group Checks, Corpse Textures, and Troll Revival"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/mods/enemyExpansion/dexNames.js"
  - "src/mods/enemyExpansion/dexTables.js"
  - "src/revenants/revenantFeud.js"
  - "src/combat/enemyGroups.js"
  - "src/world/nearbyObjects.js"
  - "src/world/playerGps.js"
  - "src/scenes/world.js"
  - "src/characters/corpseMarker.js"
  - "src/characters/corpsePrefabHost.js"
  - "src/characters/exteriorFoes.js"
  - "src/characters/foeLook.js"
  - "src/net/peerBodies.js"
  - "src/mods/enemyExpansion/dexTroll.js"
  - "src/scenes/dungeonContext.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-DEX.md"
related:
  - "enemy-expansion-secondary-arms-and-poison-order"
  - "enemy-expansion-overview"
  - "enemy-expansion-registry-sprites-and-bodies"
  - "enemy-expansion-troll-corpse-lifecycle"
invariants:
  - "Monster group checks (Detect, Dispel, Pacify, skeletal) go through the single leaf in src/combat/enemyGroups.js."
  - "resetPlayerGpsState(jump) clears the in-rect state only for jumps in RESET_ON (load and fast travel), matching PlayerGPS.ResetState."
  - "adaptBlowClass treats class IDs >= 128 as person classes; bare monster blows are not hands."
  - "Every corpse mint picks its texture through corpseTextureOf, so female variants get FemaleCorpseTexture."
  - "Street and interior corpse markers animate multi-frame corpses through tickCorpseMarkers."
  - "Troll un-death clears corpseDestroyed; room body fate persists through `validSharedFoe` on the dead record."
  - "peerBodies honors the flat noShadow carried on `foeFx`."
traps:
  - "The Barbarian (career 15) must not inherit the Skeletal Warrior rule through a shared door."
  - "readCareerTable throws on a cell past a short line; it does not treat a missing cell as empty."
  - "Encounter-table names match case-insensitively (C# OrdinalIgnoreCase)."
  - "Overworld bands must be built through `setupFoeLook`, or spectral opacity and NoShadow break."
  - "mobileBillboardSize caches per texture and record; do not mint new objects every frame."
  - "On a same-dungeon quickload, load the saved body again and clean up the ash flats on rebuild, or the troll comes back to life."
dfu:
  - "MeanerMonsters.cs"
  - "EnemyDeath.cs"
  - "TextureReplacement.cs"
tags:
  - "enemy-expansion"
  - "dex"
  - "corpse"
  - "troll"
---

# Enemy Expansion Group Checks, Corpse Textures, and Troll Revival

All fifty Enemy Expansion enemy names localize through `t()` in `src/mods/enemyExpansion/dexNames.js`, while `readCareerTable` in `src/mods/enemyExpansion/dexTables.js` throws whenever a query reads a cell past a short line and matches encounter table names case-insensitively. Monster group checks for Detect, Dispel, Pacify, and skeletal targets funnel through `src/combat/enemyGroups.js` and `src/world/nearbyObjects.js`, keeping the Barbarian (`career 15`) isolated from Skeletal Warrior rules across shared hooks. In `src/revenants/revenantFeud.js`, `adaptBlowClass` treats class IDs `>= 128` as person classes so bare monster blows never count as hand strikes.

## Visuals, Corpse Markers, and Troll Revival

Overworld bands in `src/characters/exteriorFoes.js` build appearances through `setupFoeLook` (`src/characters/foeLook.js`) to preserve spectral opacity and shadow flags, while `src/net/peerBodies.js` honors `noShadow` on `foeFx`. Corpse creation in `src/characters/corpseMarker.js` and `src/characters/corpsePrefabHost.js` selects textures via `corpseTextureOf` (assigning `FemaleCorpseTexture` to female variants), uploads archive textures with `readOnly`, caches `mobileBillboardSize`, and animates multi-frame corpses via `tickCorpseMarkers`. In `src/mods/enemyExpansion/dexTroll.js` and `src/scenes/dungeonContext.js`, troll revival clears `corpseDestroyed`, persists body fate via `validSharedFoe`, and reloads saved bodies while clearing ash flats on same-dungeon quickloads.
