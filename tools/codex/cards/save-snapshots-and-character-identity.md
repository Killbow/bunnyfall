---
slug: "save-snapshots-and-character-identity"
title: "Save Snapshots, Session Restore, and Character Identity"
domain: "systems"
kind: "subcard"
parent: "classic-systems-spine-overview"
files:
  - "src/saves/save.js"
  - "src/characters/characterId.js"
  - "src/saves/saveSlots.js"
  - "src/saves/classicSave.js"
  - "src/maps/discovery.js"
  - "src/scenes/worldModes.js"
  - "src/world/worldSaveLoad.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Systems-Arc.md"
related:
  - "classic-systems-spine-overview"
  - "world-tick-day-change-and-synthetic-time"
  - "realm-saves-and-mod-save-hooks"
  - "cloud-saves-r2-backups-and-save-tiles"
invariants:
  - "Character identity keys on `characterId` rather than character name: `snapshotPlayer` (`src/saves/save.js`) mints missing ids via `characterIdOf` (`src/characters/characterId.js`), and `adoptLegacyCards` stamps matching legacy cards."
  - "restorePlayer (src/saves/save.js:810) re-anchors lastGameMinutes and calls resetMagicRoundMarker to the restored classic minutes, so a load never replays day changes or magic rounds."
  - "restoreSessionState (src/saves/save.js:1474) runs removeAllOrphanedItems after quests restore."
  - "`shared._loading` is set before the first await in a quickload, and every early return releases it in the `finally`. An await between guard and latch lets two loads run over one entity."
  - "`closeWindowsForLoad` runs before the save is restored and before the first await, then again after the last await. A window closed after the restore hands its taken items to the loaded game and duplicates them."
  - "`interiorSaveData` resolves first when composing a save, because it writes the live interior scene into the entity cache that `snapshotPlayer` reads next."
  - "A load leaves a mounted mode with `forceExitToExterior({ cacheScene: false })`. The entity cache already holds the save's scene, and caching the dying one over it would corrupt the restored player."
  - "A classic import calls `assignShipToPlayer` after `restorePlayer`, because `restorePlayer` mints an empty permanent scene cache from the converter's null and the ship's scenes must be added to the new cache."
  - "The exit autosave runs inside `beforeunload`, so every composer it reaches must stay synchronous with no await, or the page can close mid-write."
traps:
  - "Keying save slots by characterName alone collides when characters share a name. quickLoadSlot and hasQuickSave take characterId."
  - "Restoring without resetting the magic-round marker lets the catch-up run up to MAX_CATCHUP_ROUNDS on the first tick."
  - "A quickload awaits `_magicRegistries` before reading the save, because the boot does not await it and a save read with a null `spellsByIndex` loses its spells."
  - "The classic import fills the quest machine's `globalVars` Map in place, because `machine.hooks` captured that Map reference at construction. Replacing the Map would leave the hooks reading stale globals."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "saves"
  - "snapshot"
  - "character-id"
  - "restore"
---

# Save Snapshots, Session Restore, and Character Identity

Local and classic save serialization (`src/saves/save.js`, `src/saves/saveSlots.js`, `src/saves/classicSave.js`, `src/world/worldSaveLoad.js`) isolates character slots by persistent identity and re-anchors time markers on load (`realm-saves-and-mod-save-hooks`, `cloud-saves-r2-backups-and-save-tiles`).

- **Character identity (`src/characters/characterId.js`, `src/saves/save.js`, `src/saves/saveSlots.js`):** Save slots and quick-save lookups (`quickLoadSlot`, `hasQuickSave`) key on `characterId` rather than `characterName` so characters sharing a name never collide. During `snapshotPlayer`, missing ids are minted via `characterIdOf`, and `adoptLegacyCards` stamps matching legacy save cards.
- **Snapshot contents (`src/saves/save.js`, `src/maps/discovery.js`, `src/scenes/worldModes.js`):** `snapshotPlayer` deep-copies active effects through `copyEffectEntry`, serializes map discovery via `snapshotDiscovery`, and persists banking ship ownership (`ownedShip`, `ShipType.None = -1`) and house ownership. In `src/scenes/worldModes.js`, `interiorPoolSnapshot` and `restoreInteriorPools` convert entity positions to and from native coordinates without floating-origin shifts.
- **Restore and orphan cleanup (`src/saves/save.js`):** `restorePlayer` re-anchors `lastGameMinutes` and calls `resetMagicRoundMarker` to the restored classic minutes so loading never replays day changes or triggers `MAX_CATCHUP_ROUNDS` on the first tick. After quest state loads, `restoreSessionState` invokes `removeAllOrphanedItems` (backed by `removeOrphanedItems`) to strip quest items whose owning quest no longer exists.
