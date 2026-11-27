# tools/aiRoom: the AI dungeon rooms

Generates `vendor/bunnyfall-ai-rooms/` (never edit that by hand) and checks it. Short reference: card `ai-dungeon-rooms`;
the story and numbers: `docs/AI-DUNGEON-ROOMS.md`.

## Add a room

1. Write a function in a `rooms*.mjs` file (a new `rooms5.mjs` for a new batch: add it to `all.mjs`, **after** the others,
   so existing rooms keep their names, ids and indexes). It returns a `RoomSpec` (`dsl.mjs`):

   ```js
   const r = new RoomSpec('Name', { kind: 'border' | 'interior', theme: 120 | 122 | 123 | 124, seed: 1, note: '...' });
   const f = r.floor(32.0);                     // A is 32.0, B is 12.8: the two floors every edge's ports stand on
   r.port('N', 'A', 8, f);                      // a door on the north edge at port A, a corridor 8 cells (1.6 m each) in
   r.rect(7, 8, 24, 23, r.floor(32.0, { clear: 6.4 }));      // shapes: rect disc octagon annulus frame corridor ramp
   r.prop('pillar-round-tall', 12.5, 12.5);     // pieces.mjs names; (x, z) in cells, a cell's middle is i + 0.5
   return r.autoLights(4).populate({ enemies: 7, loot: 3, quest: 2, seed: 1 });
   ```
   The grid is 32 x 32 cells; port A's corridor is columns/rows 9-10, port B's 21-22. A port needs its corridor to reach
   the room (`len` long enough, or `link`/`corridor`); ports are carved last, so shapes drawn after cannot overwrite them.
   Keep props out of 2-wide corridors. Pieces over the ceiling height are refused.
2. `ARENA2_PATH=<arena2> node tools/aiRoom/build.mjs --check --preview /tmp/p` : the room's own test (ports open and
   at the right floor, everything reachable, markers present) and a top-down picture.
3. `node tools/aiRoom/walk.mjs --only <name>` : the game's real player controller walks door to door and to every marker.
4. `node tools/aiRoom/build.mjs` writes the files. `connect.mjs` / `joins.mjs` / `integrate.mjs` measure the whole.
5. To LOOK at it in the game: `shots.mjs` (read its header: it needs a temporary patch to the dungeon scene).

A room that joins its two floors (a stair) sets `r.joinsLevels = true` (`switchbackCore` in `lib.mjs` does); the swap law
reads it from `rooms.json`.
