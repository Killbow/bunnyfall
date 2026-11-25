---
slug: host-split-extracted-modules
title: "Host-Split Extracted Modules"
domain: overview
kind: subcard
parent: host-split-overview
files:
  - src/travel/travelViewMarks.js
  - src/world/pixelBuild.js
  - src/items/roomLootHost.js
  - src/items/bodyLootHost.js
  - src/world/wild/wildEscrowHost.js
  - src/world/wild/wildSeizeHost.js
  - src/worldEvents/standInSpell.js
  - src/travel/travelViewDungeonModels.js
  - src/travel/regionChaseHost.js
  - src/characters/corpsePrefabHost.js
  - src/maps/exteriorAutomapToggle.js
  - src/world/groundSets.js
  - src/trade/vendorHost.js
  - src/party/partyArrival.js
  - src/world/wild/wildRejoin.js
routes: []
tables: []
replacesBible:
  - "01-Overview/Host-Split.md"
related:
  - host-split-overview
  - host-move-tooling-and-handle-semantics
  - travel-view-traveller-marks-and-hud
  - market-vendors-and-professions
  - integrity-pvp-duel-and-wild-referees
invariants:
  - "Shared logic used by multiple hosts lives in a single seam module: corpsePrefabHost.js serves both buildDungeonContext and createExteriorFoes, and standInSpell.js defines the stand-in spell door once."
traps:
  - "Destructured constructor return bindings replace hoisted function declarations, so any host call situated above the constructor call throws in the temporal dead zone."
dfu: []
tags:
  - host-split
  - modules
  - boot-world
  - build-dungeon-context
---

Companion modules extracted from the scene hosts expose a `create*` factory that accepts settled by-value bindings and a live `host` handle object, returning the entry-point functions still invoked by the remainder of the host closure. Because destructured factory returns replace hoisted `function` declarations, each constructor call sits below every by-value `const` it reads and above its first caller in the host body.

## `bootWorld` Companion Modules

Extractions from `bootWorld` (`src/scenes/world.js`) include:

- **Travel view and exterior helpers:** `createTravelViewMarks` (`src/travel/travelViewMarks.js`, the pilot extraction exporting `tvBadgeOf` and `TV_PEER_HEAD_M`), `createTravelViewDungeonModels` (`src/travel/travelViewDungeonModels.js`), `createPixelBuild` (`src/world/pixelBuild.js`, returning `buildPixelNow`), `createExteriorAutomapToggle` (`src/maps/exteriorAutomapToggle.js`), and `createGroundSets` (`src/world/groundSets.js`).
- **World actors, vendors, and wild referees:** `createVendorHost` (`src/trade/vendorHost.js`, receiving the `checkpointGateOpen` closure), `createBodyLootHost` (`src/items/bodyLootHost.js`), `createWildSeizeHost` (`src/world/wild/wildSeizeHost.js`), `createWildEscrowHost` (`src/world/wild/wildEscrowHost.js`), `createRegionChaseHearing` (`src/travel/regionChaseHost.js`), `createPartyArrivalHost` (`src/party/partyArrival.js`), and `createWildRejoin` (`src/world/wild/wildRejoin.js`, whose `.bodyAt` method looks up wild remains records).

## `buildDungeonContext` and Shared Seam Modules

Extractions from `buildDungeonContext` (`src/scenes/dungeonContext.js`) and shared multi-host seams include:

- **Dungeon loot:** `createRoomLoot` (`src/items/roomLootHost.js`), which reads and writes the active room attachment through the `onlineRoom` handle.
- **Stand-in spell seam:** `createStandInSpell` and `createSerpentSpell` (`src/worldEvents/standInSpell.js`) consolidate stand-in spell doors across dungeon and world hosts.
- **Corpse prefab seam:** `src/characters/corpsePrefabHost.js` provides `createDungeonCorpsePrefabs` for `buildDungeonContext` and `createStreetCorpsePrefabs` for `createExteriorFoes` (`src/characters/exteriorFoes.js`).
