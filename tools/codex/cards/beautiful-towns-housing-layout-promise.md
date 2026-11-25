---
slug: "beautiful-towns-housing-layout-promise"
title: "Town Layout Promise: Save Pins, Sleeping Deeds, and Online Home Layouts"
domain: "homes"
kind: "subcard"
parent: "beautiful-towns-layout-mods-overview"
files:
  - "src/world/layoutPins.js"
  - "src/trade/banking.js"
  - "src/world/sceneCache.js"
  - "src/scenes/worldModes.js"
  - "src/maps/discovery.js"
  - "src/homes/homesWorld.js"
  - "src/world/interiorShared.js"
  - "src/platform/onlineLane.js"
  - "src/net/homeLaw.js"
  - "server-account/src/homes.js"
  - "server-account/src/routes/townRoutes.js"
  - "server-account/src/routeStatus.js"
  - "server-account/migrations/0073_home_layout.sql"
routes:
  - "/v1/homes/layouts"
  - "/v1/homes/claim"
tables:
  - "homes"
replacesBible:
  - "03-World/Beautiful-Towns.md"
related:
  - "beautiful-towns-layout-mods-overview"
  - "town-mod-layout-pins-and-shared-seats"
  - "quest-sites-and-homed-reseating"
  - "homes-camps-guilds-and-territories"
invariants:
  - "`pinsFrom` keeps each town's strongest record by `RECORD_WEIGHT` (house 5, room 4, quest/questor 3, inside/anchor 2, repair 1) and pins only mods that actually touch the town (`layoutModTouches`)."
  - "`deedStands` (src/trade/banking.js) delegates to `recordStands`; `isHouseOwned` grants nothing while the town stands in another layout."
  - "Interior scenes are cached under `layoutSceneName(sceneName, layout)` = `name|layout`; `restoreInteriorScene` (src/scenes/worldModes.js) restores only matching layouts."
  - "`pruneDiscoveryLayouts` drops a town's discovered buildings when its current stamp no longer matches."
  - "`homeLayoutsMatch` compares the set of layout mods and ignores versions. A mismatched claim returns `home-layout` (HTTP 409). A claim body without `layout` returns `home-update` (HTTP 426)."
  - "`ONLINE_ROOM_MOD_KEYS` forces `beautiful-villages` and `beautiful-cities` `Enabled: true` in online rooms."
traps:
  - "`layoutRoomKey` adds `tag * 0x1000000` to the building key; always derive interior room keys through it so peers in different layouts never share a room."
  - "Boot waits `HOME_LAYOUTS_WAIT_MS` (6000) for `/v1/homes/layouts`, then retries `HOME_LAYOUTS_RETRIES` (4) times behind play; `homeLayoutsHeard` stays false while packs are missing."
dfu:
  - "Assets/Scripts/Game/Entities/DaggerfallInterior.cs"
tags:
  - "homes"
  - "layout-pins"
  - "deeds"
  - "online"
  - "town-mods"
---

# Town Layout Promise: Save Pins, Sleeping Deeds, and Online Home Layouts

Town layout pins isolate player deeds, interior scene caches, map discovery, and online home claims across town-mod configurations.

## Offline Pins, Sleeping Deeds, and Interior Caches

- **Weighted town pins (`src/world/layoutPins.js`):** `pinsFrom` selects the strongest record per town by `RECORD_WEIGHT` (`house: 5`, `room: 4`, `quest`/`questor: 3`, `inside`/`anchor: 2`, and `repair: 1`), pinning only mods confirmed by `layoutModTouches`.
- **Sleeping deeds and scene caches:** `deedStands` (`src/trade/banking.js`) delegates to `recordStands`, keeping `isHouseOwned` inactive in non-matching layouts. Interior scenes cache under `layoutSceneName(sceneName, layout)` (`name|layout` in `src/world/sceneCache.js`), `restoreInteriorScene` (`src/scenes/worldModes.js`) restores matching layouts, and `pruneDiscoveryLayouts` (`src/maps/discovery.js`) clears discovered buildings on stamp changes.

## Online Home Layouts and Room Keys

- **Online enforcement and D1 claims:** `ONLINE_ROOM_MOD_KEYS` (`src/platform/onlineLane.js`) forces `beautiful-villages` and `beautiful-cities` to `Enabled: true` online. The `homes` table stores `homes.layout` (`0073_home_layout.sql`, `idx_homes_town_age`). On `/v1/homes/claim` (`server-account/src/homes.js` and `server-account/src/routeStatus.js`), `homeLayoutsMatch` (`src/net/homeLaw.js`) compares active mods without versions: mismatches return `'home-layout'` (HTTP `409`), and missing `layout` returns `'home-update'` (HTTP `426`).
- **Boot sync and room keys:** Boot (`src/homes/homesWorld.js`) waits `HOME_LAYOUTS_WAIT_MS` (`6000`) for `/v1/homes/layouts` (`server-account/src/routes/townRoutes.js`) and retries `HOME_LAYOUTS_RETRIES` (`4`) times, keeping `homeLayoutsHeard` false while packs are missing. Compute interior room keys via `layoutRoomKey` (`src/world/interiorShared.js`), adding `tag * 0x1000000` so differing layouts never share rooms.
