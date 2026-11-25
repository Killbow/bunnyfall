---
slug: dungeon-sizing-and-online-quest-relay
title: "Medium and Online Dungeon Sizes and the Quest Marker Re-lay"
domain: world
kind: subcard
parent: dungeon-exploration-aids-overview
files:
  - src/world/smallerDungeons.js
  - src/systems/quest/questRepair.js
  - src/systems/quest/questBridge.js
  - src/systems/quest/quest.js
  - src/systems/quest/machine.js
  - src/mods/features.js
routes: []
tables: []
replacesBible:
  - `01-Overview/audits/Audit-Delve.md`
  - `03-World/Delve-Arc.md`
related:
  - dungeon-exploration-aids-overview
  - online-coop-shared-dungeon-and-interior-rooms
  - abyss-dungeon-discovery-and-rift
invariants:
  - "A medium dungeon uses `MEDIUM_LAYOUT`: two interior blocks side by side (starting block first) surrounded by six border blocks. It applies to dungeons with more than `MEDIUM_DUNGEON_THRESHOLD` (`8`) blocks, drawn from the block list of the dungeon with `DFRandom` seeded on `MapId`."
  - "Smaller Dungeons (a five-block cross above `SMALLER_DUNGEON_THRESHOLD = 5`) takes precedence over medium when enabled."
  - "Main story dungeons, the arena undercroft, editor dungeons, and super-tier Hollows always use `'full'`."
  - "Online, `dungeonSizeFor` uses `onlineDungeonSize`, a seeded draw per map id (`ONLINE_DUNGEON_SIZES` weights `small: 1`, `medium: 2`, and `full: 1`, with salt `ONLINE_DUNGEON_SIZE_SALT`). It ignores local player switches and produces the same size on every client."
  - "A quest freezes its size at start through `smallerDungeonsStateNow`. Online, the stamp is `ONLINE_DUNGEONS_STATE` (`4`)."
  - "On an online save load, `relayOnlineDungeons` re-enumerates the dungeon markers of each running quest on the room build before anything mounts, then stamps `ONLINE_DUNGEONS_STATE`."
  - "`adoptLinkedDungeonSize` returns `null` online."
traps:
  - "Stamp values are a persisted save format: `NotSet: 0`, `Disabled: 1`, and `Enabled: 2` (DFU `SMALLER_DUNGEONS_STATE` order), followed by `MEDIUM_DUNGEONS_STATE = 3`, `ONLINE_DUNGEONS_STATE = 4`, and `MEDIUM_DISTINCT_STAMP = 5`. Append new values and never renumber."
  - "`relayWholeDungeons` is retired and survives only in a comment in `src/systems/quest/questRepair.js`. Call `relayOnlineDungeons` or `relayQuestOnline` (for shared quests)."
dfu:
  - Assets/Scripts/API/MapsFile.cs
tags:
  - dungeon
  - dungeon-size
  - medium-dungeons
  - online
  - quest-markers
  - DSIZE1
  - SD-ONLINE
  - dungeon-audit
---

# Medium and Online Dungeon Sizes and the Quest Marker Re-lay

`src/world/smallerDungeons.js` and `src/systems/quest/questRepair.js` extend DFU block pruning (`Assets/Scripts/API/MapsFile.cs`) with an eight-block medium layout (`DSIZE1`) and deterministic online sizing (`SD-ONLINE`).

## Medium Layout and Seeded World Sizes

A `MAPS.BSA` and `BLOCKS.BSA` census of `4,232` dungeons shows `8` blocks as the most common footprint (`1,162` dungeons), and large dungeons contain only `4` interior blocks. `MEDIUM_LAYOUT` (`src/world/smallerDungeons.js`) therefore places `2` side-by-side interior blocks (starting block first) inside `6` border blocks for any dungeon exceeding `MEDIUM_DUNGEON_THRESHOLD = 8`, selecting interior blocks via `DFRandom` seeded by `MapId`.

Offline, the enhanced skin (`src/mods/features.js`) exposes `MEDIUM_DUNGEONS_PREF` (`'mediumDungeons'`) and `WORLD_DUNGEON_SIZES_PREF` (`'worldDungeonSizes'`), while Smaller Dungeons (`SMALLER_DUNGEON_THRESHOLD = 5`) overrides medium when active. Main story dungeons, the arena undercroft, editor layouts, and super-tier Hollows (`abyss-dungeon-discovery-and-rift`) always stay `'full'`.

Online (`online-coop-shared-dungeon-and-interior-rooms`), `dungeonSizeFor` delegates to `onlineDungeonSize`, rolling `ONLINE_DUNGEON_SIZES` (`small: 1`, `medium: 2`, `full: 1`) with `ONLINE_DUNGEON_SIZE_SALT` per map id so every peer builds identical geometry.

## Quest Stamps and Online Marker Re-lay

At quest start (`src/systems/quest/quest.js`, `src/systems/quest/machine.js`, `src/systems/quest/questBridge.js`), `smallerDungeonsStateNow` records `SMALLER_DUNGEONS_STATE` (`NotSet: 0`, `Disabled: 1`, `Enabled: 2`), `MEDIUM_DUNGEONS_STATE = 3`, `ONLINE_DUNGEONS_STATE = 4`, or `MEDIUM_DISTINCT_STAMP = 5`. Online, `adoptLinkedDungeonSize` returns `null`, and loading a save runs `relayOnlineDungeons` (or `relayQuestOnline` for shared quests) in `src/systems/quest/questRepair.js` to re-place active quest markers onto the online block layout before mounting.
