---
slug: shop-quest-spawns-chest-matching-and-owed-strikes-overview
title: "Interior Quest Enemy Fallback, Home Chest Matching, and Open Hand Owed Strikes"
domain: quests
kind: overview
parent: null
files:
  - src/systems/quest/questFoeHost.js
  - src/scenes/worldModes.js
  - src/ui/inputActions.js
  - src/homes/chestRecords.js
  - src/homes/decorRoom.js
  - src/systems/quest/place.js
  - src/systems/quest/machine.js
  - src/items/lootPowers.js
  - src/scenes/dungeonContext.js
  - src/net/motherlodeBook.js
  - src/ui/nodeMarks.js
routes:
  - /v1/mod/realm-rollback
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12g.md"
related:
  - window-pane-depth-clip-and-body-batch-closure
  - quest-sites-and-homed-reseating
  - professions-gathering-nodes-and-motherlodes
invariants:
  - "After `ROOM_RING_MISSES` (`30`) failed interior spawn ticks, `placeRoomQuestFoe` (`src/systems/quest/questFoeHost.js`) switches to `ROOM_NEAR_RING` (`{ minDistance: 2.5, lineOfSightCheck: false }`) and then `roomMarkerSpot`."
  - "`repairUnloseableBindings` (`src/ui/inputActions.js`) restores a missing default key only when no active action already claims that key code."
  - "`matchChests` (`src/homes/chestRecords.js`) pairs saved home chests by `chestIdentity` within `CHEST_MATCH_REACH` (`0.5` m) before index fallback, and `revealNearSites` reveals `nearSite` towns on quest acceptance."
  - "Open Hand (`share: 50` in `src/items/lootPowers.js`) queues extra strikes on recordless targets via `oweFoe` and `takeOwed`, consumed by `landOnBoss`, `landOnCrystal`, `landOnHost`, and `landOnRival` in `src/scenes/dungeonContext.js`."
traps:
  - "`ROOM_NEAR_RING` is a frozen options object rather than a scalar distance."
  - "Motherlode compass and map marks read `MOTHERLODE_MARK_CSS` (`#00e5c8`) via `nodeMarkCss('motherlode')`, and `markedAll` (`src/net/motherlodeBook.js`) suppresses repeat marks once the daily find is claimed."
dfu: []
tags:
  - quests
  - homes
  - input
  - loot-powers
  - motherlode
---

# Interior Quest Enemy Fallback, Home Chest Matching, and Open Hand Owed Strikes

Interior quest placement, home chest matching, binding repair, Open Hand strike queuing, and motherlode marking coordinate across client systems.

- **Quest spawns and site reveal (`src/systems/quest/questFoeHost.js`, `src/scenes/worldModes.js`, `src/systems/quest/place.js`, `src/systems/quest/machine.js`):** After `ROOM_RING_MISSES` (`30`) failed interior spawn ticks, `placeRoomQuestFoe` switches to the frozen options object `ROOM_NEAR_RING` (`{ minDistance: 2.5, lineOfSightCheck: false }`) and then `roomMarkerSpot`. On quest acceptance, `revealNearSites` reveals `nearSite` towns.
- **Chest matching and bindings (`src/homes/chestRecords.js`, `src/homes/decorRoom.js`, `src/ui/inputActions.js`):** `matchChests` pairs saved home chests by `chestIdentity` within `CHEST_MATCH_REACH` (`0.5` m) before index fallback. `repairUnloseableBindings` restores a missing default key only when no active action claims that key code.
- **Open Hand strikes, motherlodes, and rollback (`src/items/lootPowers.js`, `src/scenes/dungeonContext.js`, `src/net/motherlodeBook.js`, `src/ui/nodeMarks.js`):** Open Hand (`share: 50`) queues extra strikes on recordless targets via `oweFoe` and `takeOwed`, consumed by `landOnBoss`, `landOnCrystal`, `landOnHost`, and `landOnRival`. Motherlode marks read `MOTHERLODE_MARK_CSS` (`#00e5c8`) via `nodeMarkCss('motherlode')`, and `markedAll` suppresses repeat marks once the daily find is claimed. `/v1/mod/realm-rollback` restores moderator realm checkpoints.
