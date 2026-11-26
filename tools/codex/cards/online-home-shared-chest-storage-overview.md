---
slug: online-home-shared-chest-storage-overview
title: "Online Home Chest Storage: Permanent Home Scene Key and Shared Bin"
domain: homes
kind: overview
parent: null
files:
  - src/net/homeScene.js
  - src/net/homeLaw.js
  - src/homes/onlineHomes.js
  - src/world/sceneCache.js
  - server-account/src/decorAccess.js
  - server-account/migrations/0169_decor_access.sql
routes:
  - /v1/homes/decor/use
tables:
  - decor_bin
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25d.md"
related:
  - decor-grants-wait-and-shared-chest-open
  - homes-camps-guilds-and-territories
  - arena-city-block-and-home-relocation
invariants:
  - "`homeSceneName(mapId, buildingKey)` (`src/net/homeScene.js`) formats `OnlineHome [MapID=<u32>, BuildingKey=<key>]` so private chest contents persist under the character permanent home scene rather than transient `DaggerfallInterior` scenes."
  - "`moveChest` (`server-account/src/decorAccess.js`) pours returned chest items into `homeSceneName` and registers that key in `sceneCache.permanentScenes` within the same save write, while shared chests store items in `decor_bin`."
  - "`homeSceneName` lives in the zero-relay leaf `src/net/homeScene.js` rather than `src/net/homeLaw.js` so relay bundle hashes stay unaffected."
  - "`restoreCachedScene` deletes the entry it returns, so a scene restores once per caching, and the non-start `clearSceneCache` keeps only permanent scenes already cached, minus their `CorpseMarker` containers."
traps:
  - "Storing house chest items under the generic interior building scene causes the next `clearSceneCache` transition to wipe them."
  - "The `interiorSceneName` and world scene name strings are the cache keys, so any change to their format silently misses every saved or permanent scene."
dfu: []
tags:
  - homes
  - decor
  - storage
  - scene-cache
---

# Online Home Chest Storage: Permanent Home Scene Key and Shared Bin

Online home chest storage splits items between character-saved private containers keyed by `homeSceneName` and D1 shared bins in `decor_bin` (`server-account/migrations/0169_decor_access.sql`), routing access mutations through `/v1/homes/decor/use`.

## Permanent Scene Naming and Zero-Relay Leaf

- **Canonical key (`src/net/homeScene.js`, `src/homes/onlineHomes.js`):** `homeSceneName(mapId, buildingKey)` formats `OnlineHome [MapID=<u32>, BuildingKey=<key>]` and is shared between the browser client and `server-account`. Keeping `homeSceneName` in the zero-relay leaf `src/net/homeScene.js` rather than `src/net/homeLaw.js` preserves relay bundle hashes.
- **Scene cache retention (`src/world/sceneCache.js`):** Private home chests store contents under `homeSceneName` inside `sceneCache.permanentScenes`. Writing chest items under a generic `DaggerfallInterior` building scene leaves them unprotected when the next `clearSceneCache` transition flushes transient interior scenes.

## Shared Bin Transfers

- **Chest mode transitions (`server-account/src/decorAccess.js`):** Shared home chests keep their items in `decor_bin`. When `moveChest` transitions items back to private character storage, it pours the returned chest items into the `homeSceneName` container and registers that scene key in `sceneCache.permanentScenes` within the same save write.
