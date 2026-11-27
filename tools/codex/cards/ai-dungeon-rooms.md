---
slug: ai-dungeon-rooms
title: AI Dungeon Rooms
domain: world
kind: overview
parent: null
files:
  - src/world/aiRoomLaw.js
  - src/world/aiRooms.js
  - src/world/smallerDungeons.js
  - src/mods/modWorldData.js
  - tools/aiRoom/build.mjs
  - tools/aiRoom/walk.mjs
routes: []
tables: []
related:
  - spawned-dungeons-rebirth-overview
invariants:
  - "A swap is a second pass over a dungeon's drawn blocks (`dungeonLocationFor`'s last step), on `hash32(salt, mapId, x, z)`: it moves none of DFU's draws, and the same dungeon is the same on every client."
  - "Never the starting block, a main-story dungeon, an editor dungeon, or a block with a non-classic name; a border (`B...`) is swapped for a border room, any other for an interior room."
  - "Every room carries enemy (199_15), loot (199_19), quest (199_11) and quest-item (199_18) markers, and its used doors stand on the classic ports: A at 16.0 m (floor 32.0), B at 35.2 m (floor 12.8) on every edge."
  - "A layout with AI rooms adds `AI_STAMP_OFFSET` (16) to `smallerDungeonsStamp`, so a save from the other layout stands at the start."
traps:
  - "Rooms and pieces in `vendor/bunnyfall-ai-rooms` are generated: edit `tools/aiRoom/rooms*.mjs` and `pieces.mjs`, then run `build.mjs` (`--check` tests, `walk.mjs` walks every room with the real motor)."
  - "Port blocks are carved last (`RoomSpec.finish`), so a shape drawn after `port()` cannot overwrite a corridor."
  - "Block indexes 910001+ and model ids 7100001+ must stay clear of the other port blocks (900000-900500) and the editor's 7000001+."
tags:
  - dungeons
  - rdb
  - mods
---

# AI Dungeon Rooms

Twenty rooms (6 border, 14 interior) and twenty new 3D pieces, laid out in code by `tools/aiRoom` and shipped as `vendor/bunnyfall-ai-rooms` (an editor-mod folder: one `Enabled` switch, a Features row, an online room key). A room is a 32 x 32 grid of 1.6 m cells turned into one shell model (floors, walls, ceilings, door holes) plus props, lights, doors and markers. Textures are Daggerfall's slot numbers (120/122/123/124), so each dungeon's texture table dresses them.

`aiRooms.js` serves the blocks through `registerPortBlock` and `withAiRooms` applies the law in `aiRoomLaw.js`: 30% of a dungeon's ordinary blocks. Checks, all in `tools/aiRoom`: `build.mjs --check` (ports, reachability, markers), `walk.mjs` (348 legs walked by the game's own controller), `integrate.mjs` (real MAPS dungeons through `layoutDungeon`).
