---
slug: searchable-swimmers-single-body-and-lodged-enemies-overview
title: "Searchable Swimmer Exclusions, Single Account Socket, and Lodged Enemy Freeing"
domain: systems
kind: overview
parent: null
files:
  - src/items/searchables.js
  - src/characters/dungeonEnemies.js
  - src/scenes/dungeonContext.js
  - server/src/index.js
  - src/net/wire.js
  - src/characters/peopleBodies.js
  - src/scenes/worldModes.js
  - src/world/npcFlatArchives.js
  - src/characters/foeSpacing.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-15c.md"
related:
  - fletching-arrow-yield-chain-substitutes-and-boulder-lift
  - searchables-overview
  - relay-ground-gate-hello-and-refusal
invariants:
  - "`pickRosterFoe` (`src/items/searchables.js`) filters out `WATER_SPECIES` (`Slaughterfish`, `Dreugh`, `Lamia` in `src/characters/dungeonEnemies.js`) when waking ambush enemies from dry containers, falling back to grave undead if the roster is swimmer-only."
  - "Cell and world relay rooms (`server/src/index.js`) retain at most one active socket per account; a newer `hello` closes the prior socket with `CLOSE_REPLACED`."
  - "`personLook` (`src/characters/peopleBodies.js`) spawns 3D bodies only for flats in `NPC_FLAT_ARCHIVES` (`src/world/npcFlatArchives.js`) unless flagged `questPerson`."
  - "`lodgedIn` and `freeLodgedFeet` (`src/characters/foeSpacing.js`) step quest and dungeon enemies clear of pillars within `LODGE_REACH = 4`."
traps:
  - "Never hardcode `RELAY_VERSION` literals in callers; import the live constant from `src/net/wire.js`."
dfu: []
tags:
  - searchables
  - relay
  - npc-flats
  - collision
---

# Searchable Swimmer Exclusions, Single Account Socket, and Lodged Enemy Freeing

Searchable ambush filtering, single-account relay room sockets, 3D NPC flat archive checks, and pillar dislodging keep dungeon, interior, and relay state consistent.

- **Dry container ambushes (`src/items/searchables.js`, `src/characters/dungeonEnemies.js`, `src/scenes/dungeonContext.js`):** When waking ambush enemies from dry containers, `pickRosterFoe` filters out `WATER_SPECIES` (`Slaughterfish`, `Dreugh`, and `Lamia`) and falls back to grave undead if the layout roster contains only swimmers.
- **Single account socket (`server/src/index.js`, `src/net/wire.js`):** Cell and world relay rooms retain at most one active socket per account; a newer `hello` closes the prior socket with `CLOSE_REPLACED`. Never hardcode `RELAY_VERSION` literals in callers; import the live constant from `src/net/wire.js`.
- **3D NPC flats and lodged enemies (`src/characters/peopleBodies.js`, `src/world/npcFlatArchives.js`, `src/characters/foeSpacing.js`, `src/scenes/worldModes.js`):** `personLook` spawns 3D bodies only for flats in `NPC_FLAT_ARCHIVES` unless flagged `questPerson`, and `PERSON_TURN_RATE` governs 3D static NPC turn smoothing. `lodgedIn` and `freeLodgedFeet` step quest and dungeon enemies clear of pillars within `LODGE_REACH = 4`.
