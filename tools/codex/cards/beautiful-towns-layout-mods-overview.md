---
slug: "beautiful-towns-layout-mods-overview"
title: "Beautiful Villages and Cities: World-Data Packs, Door Latch, and Layout Stamps"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/mods/modWorldData.js"
  - "src/mods/modSettings.js"
  - "src/formats/worldDataReplacement.js"
  - "src/world/layoutPins.js"
  - "src/world/worldDataVariants.js"
  - "src/mods/rrQuestLine.js"
  - "vendor/beautiful-villages/README.md"
  - "vendor/beautiful-cities/README.md"
  - "tools/worldDataPackBuild.mjs"
routes: []
tables: []
replacesBible:
  - "03-World/Beautiful-Towns.md"
related:
  - "beautiful-towns-housing-layout-promise"
  - "beautiful-towns-stand-ins-and-curation"
  - "town-mod-quest-site-fallback-overview"
  - "town-mod-layout-pins-and-shared-seats"
invariants:
  - "`latchWorldDataDoor` (src/formats/worldDataReplacement.js) latches `assetInjectionOn() || isOnlinePage()` once; `worldDataDoorOpen` reads the latch, so online the door is always open."
  - "Offline, a pack loads only when `modSetting(vendor, 'Enabled') === true` and the door is open; src/mods/modWorldData.js then calls `latchModLoaded(vendor, got > 0)` and adds failed vendors to `worldDataPacksMissing()`."
  - "`WORLD_DATA_PRIORITY` (src/mods/modWorldData.js) is `{ 'beautiful-villages': 10, 'beautiful-cities': 20 }`, so Beautiful Cities wins a block both mods ship."
  - "`layoutStampOf` joins sorted `vendor@version` parts with `+` (versions from `LAYOUT_MOD_VERSIONS`), or returns `CLASSIC_LAYOUT` ('classic')."
  - "`dungeonFromJson` keeps `LocationDungeon.RecordElement` headers so the castles in Daggerfall, Sentinel, and Wayrest resolve their LocationId."
  - "A pack's `$c` reference names a classic block by index, and `tools/worldDataPackBuild.mjs` records each referenced block's name in `classicNames`, so with a `BLOCKS.BSA` in a different order the game refuses that file and serves the classic block instead of reading another block's pieces."
traps:
  - "A mod switch flipped mid-game reaches nothing until the next load; read `modLatchedOn`, not the live setting."
  - "`BLOCK_CACHE_MAX` (192) evicts the oldest block; do not assume every replaced block stays resident."
dfu:
  - "Assets/Scripts/Game/Serialization/SerializableGameObject.cs"
  - "Assets/Scripts/Utility/RMBLayout.cs"
tags:
  - "town-mods"
  - "world-data"
  - "beautiful-villages"
  - "beautiful-cities"
  - "layout-stamp"
---

# Beautiful Villages and Cities: World-Data Packs, Door Latch, and Layout Stamps

Beautiful Villages (`vendor/beautiful-villages/README.md`) and Beautiful Cities (`vendor/beautiful-cities/README.md`) replace town blocks and location definitions through `src/formats/worldDataReplacement.js` and `src/mods/modWorldData.js`.

## Door Latch, Pack Loading, and Priority

- **World-data door latch (`src/formats/worldDataReplacement.js`):** `latchWorldDataDoor` latches `assetInjectionOn() || isOnlinePage()` once per session, and `worldDataDoorOpen` reads that latch so online sessions always keep the door open. Offline, a vendor pack loads only when the door is open and `modSetting(vendor, 'Enabled') === true`. After loading, `src/mods/modWorldData.js` calls `latchModLoaded(vendor, got > 0)` (`src/mods/modSettings.js`) and records failed vendors in `worldDataPacksMissing()`. Because mid-game setting toggles do not reload packs, callers must read `modLatchedOn` rather than live settings.
- **Priority and block cache:** `WORLD_DATA_PRIORITY` assigns `'beautiful-villages': 10` and `'beautiful-cities': 20`, so Beautiful Cities wins any block shipped by both packs. Replaced blocks cache up to `BLOCK_CACHE_MAX` (`192`), evicting the oldest entry. `dungeonFromJson` preserves `LocationDungeon.RecordElement` headers so the castles in Daggerfall, Sentinel, and Wayrest resolve their `LocationId`.
- **Layout stamps and variant keys:** `layoutStampOf` (`src/world/layoutPins.js`) joins sorted `vendor@version` tokens from `LAYOUT_MOD_VERSIONS` (`beautiful-villages` at `1.4.2` and `beautiful-cities` at `0.5.0`) with `+`, or returns `CLASSIC_LAYOUT` (`'classic'`). `readingLocationKeyOf` (`src/world/worldDataVariants.js`) resolves variant location keys, and `rrMasterArmBuildingKeyIn` (`src/mods/rrQuestLine.js`) locates the moved `ARMRAM03` shop key on the town grid.
