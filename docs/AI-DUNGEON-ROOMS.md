# AI-generated dungeon rooms

Status 2026-11-27: **built, checked in node, and seen in the real game (headless Chromium).** "Tile" means a dungeon room, an RDB block.
The card `ai-dungeon-rooms` is the short reference; this is how it was done and what is left.

## What was built

- **40 rooms** (14 border `B7000001-14`, 26 interior `N7000001-26`, in two batches of 20) and **20 new 3D pieces** (pillars, arch, sarcophagus,
  altar, statue, stalagmites and stalactites, rubble, cage, well, throne, table, gate, bone pile, lectern ...), all
  generated in code under `tools/aiRoom/` and shipped as `vendor/bunnyfall-ai-rooms/` (about 1.6 MB).
- **How a room is made.** A room is a 32 x 32 grid of 1.6 m cells (`shell.mjs`): floors, ramps, walls, ceilings and door
  holes become one model; props, lights, doors and markers go in the block (`block.mjs`, `dsl.mjs`). Rooms are authored as
  short programs in `rooms1-4.mjs`. A person or an AI can add one by writing another function.
- **What the classic rooms taught.** All 187 classic rooms share the same connection points: two doors on every edge, at
  16.0 m (floor 32.0) and 35.2 m (floor 12.8). New rooms use exactly those, so they join classic neighbours. Doors,
  enemy, loot, quest and quest-item markers are cloned from the commonest classic ones.
- **How they get into dungeons.** `src/world/aiRoomLaw.js`: after a dungeon's blocks are drawn (including the small and
  medium re-draws), 30% of its ordinary blocks are swapped for a room of the same kind (border for border, interior for
  interior), by a hash of the dungeon and the block's place. It never touches the starting block, a main-story dungeon,
  an editor dungeon or a non-classic block, and it moves none of DFU's own random draws. `src/world/aiRooms.js` serves
  the blocks and is called last in `dungeonLocationFor`. Spawned dungeons are covered too, since they come through the
  same door. One switch: `Enabled` (Features, Gameplay > Dungeons); online the room owns it.
- **Saves.** A layout with rooms in it adds 16 to the dungeon save stamp, so a save made in the old layout is put at
  the dungeon's start rather than inside a room that has changed.

## What was checked, and how

- `build.mjs --check`: every used door is open and at the right floor, every door and marker is reachable, every prop
  stands on floor under a high enough ceiling, a quest marker exists. All 40 pass.
- `walk.mjs`: the game's own player controller and collider walk from each room's first door to every other door and
  marker: **698 of 698 legs arrive** (this found prop-blocked corridors, which were fixed).
- `integrate.mjs`: real MAPS.BSA dungeons through the game's own `layoutDungeon`, every ordinary block swapped: all lay
  out with their start marker. Over all 4,232 dungeons (14 main-story ones untouched), 3,869 get at least one room and
  29.9% of non-start blocks are swapped.
- `npm run check` passes (lint, size budget, routes, codex, types, build).

## What is not done

- **Seen in the real game, but only by a free camera.** `tools/aiRoom/shots.mjs` (with `shots.patch`, a temporary patch
  to the standalone dungeon scene) lays the rooms into a real dungeon and screenshots each: textures, walls, ceilings,
  columns, cages, torches and foes all draw correctly in several rooms (Hall of Pillars, Throne Room, Cavern Mouth,
  Sunken Arena, Prison Block, Cruciform Chapel, Pit Hall). Not yet done: playing through a room with a character, and
  entering a spawned dungeon in the full world host (the hook was exercised there only as a function call, and it
  reports on, door open, switch on).
- Foes come from the plain random-enemy marker, so their kind follows the dungeon, as in classic blocks.
- The relay and account service do not mention block names (grepped), so they need nothing. Online, every client builds the
  same layout from the same code, and the room owns the switch, so they agree.
- New pieces are single-sided stone (dungeon slot textures); no wood, metal or glass textures yet.

## Regenerating

`ARENA2_PATH=<arena2> node tools/aiRoom/build.mjs` rewrites `vendor/bunnyfall-ai-rooms/`; `--check` only tests;
`--preview <dir>` draws plans; `node tools/aiRoom/walk.mjs` and `integrate.mjs` run the other two checks, and
`shots.mjs` takes in-game screenshots (see its header; the screenshots show Daggerfall's art, so keep them out of the repo).
