# AI-generated dungeon rooms: how they would get into Bunnyfall

Research note, 2026-11-27. Nothing here is wired into the game yet. "Tile" means a dungeon **room**: an RDB block.

## What a Daggerfall room is

- BLOCKS.BSA holds **187 RDB blocks**, named by a letter and a number: `B0000000` (15, border), `N` (93), `W` (30),
  `M` (9), `S` (40). A name starting with `B` is a **border** block. Every other letter is an **interior** block.
- Each block is a 4x4 grid of cells, 2048 units a side (`RDB_SIDE`, `src/world/rdbLayout.js`). Its content is a
  **ModelReferenceList** (the 3D pieces it uses, by ARCH3D model id, e.g. `67000` corridor, `55005` door) plus up to 16
  **ObjectRoots**, each holding **Model** (a piece placed with position and rotation, possibly with an action such as a
  door or lever), **Flat** (a billboard: enemy, loot, prop or marker, by texture archive and record) and **Light** objects.
- Measured across all 187 blocks: 39,468 objects (22,962 Model, 12,238 Flat, 4,268 Light), built from only 1,046
  distinct models and 337 distinct flats. Rooms are assembled from a **small kit of prefab pieces**, not unique art.
- A location's dungeon is a list of block names on a grid (`dungeon.blocks`). There is no global "random room pool":
  each location uses its own block list. The nearest thing to randomness is `src/world/smallerDungeons.js`
  (DFU's GetRandomBlock), which redraws a dungeon of more than five blocks as a plus-shape of five. It picks from **that
  dungeon's own** blocks: interior blocks for the centre, border blocks (`B...`) for the ring.
- Spawned dungeons (`src/world/spawnedDungeons.js`) clone a real, non-main-story dungeon as a template.

## What already exists in Bunnyfall

All of the plumbing for new rooms is already there:

1. **JSON room format.** `blockToDfuJson` (`src/formats/worldDataJson.js`) writes a classic block as DFU's world-data
   JSON, and `blockFromJson` (`src/formats/worldDataReplacement.js:670`) reads it back. I checked the round trip in
   node: `B0000001.RDB` goes to JSON (about 21 KB) and back to a block of the same shape, and `layoutRdbBlock` is
   callable on it.
2. **Port-owned blocks.** `registerPortBlock(name, json, index)` serves a block under a fixed index from 900000 up,
   past the BSA. `src/world/arenaCity.js` (`installArena`) is the working precedent.
3. **Location edits.** `registerLocationEdit(fn)` runs `fn(dfLocation, maps, blocksFile)` on every location as it is
   read. This is where a dungeon's block list can be extended.
4. **Whole new places.** `locationnew-bunnyfall-*.json` files (`EDITOR_LOCATION_PREFIX`) are loaded as editor
   dungeons, laid out as built and never shrunk or cloned. `vendor/bunnyfall-dungeons/` is the shipped, still empty,
   home for the Bunnyfall Dungeon Editor's output (`WorldData/`, `WorldDataPatches/`, `Models/`). Another mod folder
   with its own `dungeon-editor.mod.json` gets a switch, a Features row and an online room key with no code
   (`src/mods/editorMods.js`).
5. **Texture replacement.** PNGs named `<archive>_<record>-<frame>.png` in `public/art/studio/<artist>/`.

## Two ways to add rooms

**A. Rooms that appear inside existing dungeons (the "random set of rooms" idea).** A module registered with
`registerLocationEdit` appends new port blocks to the block list of chosen dungeons: by dungeon type, or only spawned and
smaller dungeons. Two catches:

- The rooms must be named for the pool they join (a `B...` name for a border room). The names must not clash with
  BLOCKS.BSA. Use a prefix such as `ZAI`, with a letter that is not border (e.g. `NAI00001.RDB`, `BAI00001.RDB`) so
  `getRandomBlock` sorts them correctly.
- Classic main-story dungeons have quest markers fixed to their blocks, so new rooms should go **only** into
  spawned, smaller and editor dungeons.

**B. Whole new dungeons made of new rooms** (`locationnew-bunnyfall-*`). Simpler and safer (nothing existing changes),
and the editor mod folder gives it a switch. It does not give the "random" feel on its own.

Recommendation: do A for spawned and smaller dungeons only, with new rooms also usable by B.

## What "AI-generated" can and cannot mean

| Layer | AI can make it? | Notes |
|---|---|---|
| **Room layout** (which pieces go where, doors, enemy and loot markers, lights) | **Yes, the best fit.** | A model writes a compact room spec. A script expands it to block JSON from the kit of 1,046 existing models and the flats. No new art, and no Daggerfall pixels or geometry ship (`LICENSE.VENDORS` and the Port-Doctrine hold). |
| **New 3D pieces** | Hard | Models are Daggerfall's own binary format. The editor already supports `bunnyfall-dungeon-model/1` (ids from 7000001), but AI mesh generation is a separate research track. |
| **New wall and floor textures** | Possible | Studio rules apply: original art only, no traced or upscaled ARENA2, PNG up to 2048 px and 4 MB, an artist name on `artists.json`. An AI image would count as the committer's own work only if the owner agrees. |

## Proposed first build (small, testable)

1. `tools/aiRoom/` with a **room spec schema** (a grid of 4x4 cells, each a kit piece plus rotation, door edges,
   marker flats) and a **generator** that emits the block JSON.
2. A **validator**: run the JSON through `blockFromJson` and `layoutRdbBlock` in node. Check that the four edges line
   up for neighbours, that every model id exists in ARCH3D, and that there is a way through. Also write a top-down PNG of
   the room for review.
3. A vendor mod folder (`vendor/bunnyfall-ai-rooms/`, with `dungeon-editor.mod.json`) holding the generated blocks as
   `WorldData/*.json`, wired with `registerPortBlock` and one `registerLocationEdit` module (pool joining as in A).
4. Try them in the browser in a spawned dungeon. Add a CHANGELOG line and a codex card, and run `npm run check`.

## Risks and things I could not verify

- **I have not seen a generated room in the game.** The node round trip proves the format loads, not that the room
  looks right or plays. I found no edge or connection metadata in the block JSON, so I expect openings to be implied by the
  pieces placed in the edge cells. I did not confirm that, and it must be studied in the existing `B` and `N` blocks
  before a generator can promise rooms that join.
- `npm ci` was not run (node_modules is absent), so `npm run codex` and the build did not run. The `codex` MCP server also failed to connect this session.
- Online play: the relay and the account service may need to know about new block names if they validate room or
  dungeon data. I did not check.

## Questions for the owner

1. Is "AI-generated" the **layout** (rooms assembled by an AI from existing pieces), new **art**, or both?
2. Should the new rooms join **all** random dungeons, or only spawned and smaller ones (recommended)?
3. How many rooms for a first batch, and any theme (crypts, caves, flooded, vampire lairs)?
4. Is AI-made art acceptable under the studio's "only your own drawing" rule?
