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
  - "src/formats/saveVarsFile.js"
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
  - "`SaveVars.climateWeathers` holds the raw classic bytes; the 0x7f fog mask and the 5/6 weather swap happen in `convertClassicClimateWeathers`."
traps:
  - "Keying save slots by characterName alone collides when characters share a name. quickLoadSlot and hasQuickSave take characterId."
  - "Restoring without resetting the magic-round marker lets the catch-up run up to MAX_CATCHUP_ROUNDS on the first tick."
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
