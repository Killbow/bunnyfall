# Bunnyfall AI Rooms

Forty dungeon rooms (RDB blocks) laid out by an AI, with twenty new 3D pieces, mixed into the random dungeons.
**Made by `tools/aiRoom`; nothing here is edited by hand.** Run `ARENA2_PATH=<arena2> node tools/aiRoom/build.mjs` to
rebuild it (add `--check` to only test the rooms, `--preview <dir>` to draw each one top-down).

- `Models/7100001..7100020.json` - the pieces (pillars, arch, sarcophagus, altar, statue, stalagmites, cage, well,
  throne, ...). `Models/7100101..` - each room's shell (floors, walls, ceilings). Format `bunnyfall-dungeon-model/1`
  (`src/world/editorModels.js`). Geometry and texture NUMBERS only: the pictures are the player's own ARENA2, dressed
  per dungeon by its texture table. No Daggerfall pixels or geometry are carried.
- `Rooms/*.RDB.json` - the blocks, as DFU world-data JSON. Their doors, lights, foe, loot and quest markers are the
  classic ones' shape. They are served by `src/world/aiRooms.js` under fixed indexes from 910001.
- `rooms.json` - the list (name, kind, index, shell id).

How they get in: `src/world/aiRoomLaw.js` (the rule: a share of a dungeon's ordinary blocks, never the starting block,
never a main-story dungeon) and `src/world/aiRooms.js` (the hook, the last step of `dungeonLocationFor`). The mod's one
switch is `Enabled` (Features, Gameplay > Dungeons); online the room owns it. Offline it also needs Replace Game Artwork.
