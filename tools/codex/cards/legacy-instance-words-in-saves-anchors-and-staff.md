---
slug: legacy-instance-words-in-saves-anchors-and-staff
title: "Legacy Instance Words: Whole Layouts in Saves, Anchors, Staff Landings and Quests"
domain: multiplayer
kind: subcard
parent: instances-retired-public-place-rooms
files:
  - src/scenes/worldModes.js
  - src/world/smallerDungeons.js
  - src/net/staffTeleport.js
  - src/travel/teleportAnchor.js
  - src/scenes/world.js
  - src/systems/quest/quest.js
  - src/systems/quest/machine.js
  - src/systems/quest/questRepair.js
  - src/world/startDungeon.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Instances.md"
related:
  - instances-retired-public-place-rooms
  - dungeon-sizing-and-online-quest-relay
  - world-modes-and-transitions
invariants:
  - "`tryEnterDungeon` builds the public room whole (`place = { instance: null, whole: true }`) only when `recorded.whole === true` or `recorded.ins` is non-null; every new entry uses the online world size."
  - "`dungeonSizeFor(..., { whole })` online returns `'full'` when `whole`, else `onlineDungeonSize(dfLocation)`."
  - "`makeAnchor` (src/travel/teleportAnchor.js) stores `dungeon: { ins?, whole }`, keeping `ins` only if `instanceOfWord` parses it."
  - "src/net/staffTeleport.js validates `ins` with `instanceOfWord` and forces `whole: true` when `ins` is present."
  - "`quest.instanceEpoch` is saved and restored only if `isInstanceEpoch`; shared copies reset it with `NO_INSTANCE` in `receiveSharedQuest`."
  - "`relayQuestOnline` re-lays every running quest against the public layout and stamps `ONLINE_DUNGEONS_STATE` unless markers were unreadable."
traps:
  - "Removing the `whole` and `ins` branch strands older save positions in blocks that the world-sized build omits."
  - "`holdOpen` is still passed by world.js for new-game start and staff landings but is ignored; `HOLD_ONCE_TEXT` is unused."
dfu: []
tags:
  - instances
  - legacy-saves
  - teleport-anchor
  - staff-teleport
  - quest
  - dungeon-size
---

# Legacy Instance Words: Whole Layouts in Saves, Anchors, Staff Landings and Quests

Although `ONLINE-PUBLIC` sizes new dungeon entries via `onlineDungeonSize` (`instances-retired-public-place-rooms`, `dungeon-sizing-and-online-quest-relay`), legacy `whole` and `ins` fields remain honored so older saves, anchors, and staff landings do not strand players in pruned blocks (`src/scenes/worldModes.js`, `src/world/smallerDungeons.js`).

## Whole-Layout Fallback in Saves, Anchors, and Staff Landings

- **Entry sizing (`src/scenes/worldModes.js`, `src/world/smallerDungeons.js`, `src/scenes/dungeonContext.js`):** `tryEnterDungeon` sets `place = { instance: null, whole: true }` only when `recorded.whole === true` or `recorded.ins` is non-null, so `dungeonSizeFor(..., { whole })` returns `'full'` over `onlineDungeonSize(dfLocation)`. `placeRecord` returns `{}`, writing no instance word.
- **Anchors and staff teleport (`src/travel/teleportAnchor.js`, `src/net/staffTeleport.js`, `src/scenes/world.js`, `src/world/startDungeon.js`):** `anchorContext` sets `whole` from `builtDungeonSize(dungeonLoc) === 'full'`, and `makeAnchor` keeps `ins` in `dungeon: { ins?, whole }` if `instanceOfWord` passes. Staff teleport validates `ins` with `instanceOfWord`, forces `whole: true`, and keys dedupe strings by `ins` and the `w` flag. `holdOpen` from `src/scenes/world.js` is ignored (`HOLD_ONCE_TEXT` is unused).

## Quest Epochs and Online Re-lay

- **Quest state (`src/systems/quest/quest.js`, `src/systems/quest/machine.js`, `src/systems/quest/questRepair.js`):** `quest.instanceEpoch` persists when `isInstanceEpoch` passes and clears via `NO_INSTANCE` in `receiveSharedQuest`. `relayQuestOnline` re-lays running quests on the public layout and stamps `ONLINE_DUNGEONS_STATE`.
