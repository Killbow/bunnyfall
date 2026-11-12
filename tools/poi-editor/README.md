# World Builder

A standalone editor for Bunnyfall POIs (points of interest). The in-game editor at `/play/?editor` is the one in active
work; this one stays as it is. Both write v2 documents. It holds the editor foundation (Milestone 2), world and
decoration (Milestone 3), and the DM suite (Milestone 4). The game runs DM content on approved POIs.

## Run it

    ARENA2_PATH=/path/to/arena2 npm run poi-editor      # http://localhost:5180/editor.html
    npm run build:poi-editor                            # builds to dist-poi-editor/

On the live page (`/builder/`) there is no ARENA2 folder: File, Game files... asks for yours once and keeps the few files
the editor reads (models, palette, textures, WOODS.WLD, MAPS.BSA, BLOCKS.BSA) in this browser only.

View, Live view in the game opens `/play/?live` in another tab (the game runs offline there) and streams the open draft to it,
so the POI stands in the real world, on that screen alone. Edits follow a moment later; choosing it again takes the body
back to the POI. The viewport's own buildings and ground are only a rough guide next to it.

File, Go to a place... finds a town or city by name and moves the open POI to its middle. The game's own buildings for the
POI's map pixel are drawn round it (View, buildings), laid out by the game's `layoutLocation`, on the flat plane the game
cuts for the place. Streets' ground, trees and people are not drawn.

The dev server serves ARENA2 at `/arena2` (any file-name case). Without it the editor still runs, but models and
pictures are boxes and the banner says the game files were not found.

The server selector offers Local dev (`http://127.0.0.1:8788`, the self-host account service), Production and a custom
address. Sign in with your game account. Your role comes from `GET /v1/poi/me`.

## What is in it

- **Layout:** toolbar, asset browser and scene hierarchy on the left, viewport in the middle (3D or 2D canvas),
  inspector on the right, problems, budgets, history and log at the bottom. Splitters resize, Panels folds them.
- **Asset browser:** 17,000+ assets from the catalogue, searched in memory and drawn as a virtual grid or list.
  Filters by kind, category and tag, favourites, recents, collections, a preview pane, drag into the viewport.
- **Viewport:** orbit (right mouse), pan (middle), zoom (wheel), fly (right mouse and WASD, Shift for fast), Top, Front
  and Side views, frame (F), move, turn and size gizmos (W, E, R), world and local axes, snapping, box and click
  selection. The 3D view draws the POI's own frame in meters, and the game's base ground when WOODS.WLD is loaded (see
  Ground below); without it, it says the grid is not the terrain.
- **Scene:** groups, show and hide, lock, rename, drag to regroup, shift and ctrl selection.
- **Edit:** Ctrl+C, X, V, D, G, A, Delete and 200 steps of undo and redo. The clipboard is JSON in `localStorage` and in
  the system clipboard, so it crosses POIs and tabs. A paste leaves out an asset the catalogue lacks and says so.
- **Server:** sign in, open a POI from the store, save a draft, submit it, load its revisions.
- **Law:** the Problems tab runs the document law (`src/poi/poiLaw.js` with `poiLawV2.js`) and then the item law
  (`poiTradeLaw.js` `poiTradeProblems`). A save on the server also checks the models and pictures, and refuses a
  server-settled condition that reads a non-persistent variable (`poiPayProblems`), so a draft with no
  problems here can still be refused.

World and decoration (Milestone 3):

- **Ground** (`src/terrain.js`): WOODS.WLD read through the game's own sampler and surface read. It is the game's BASE terrain; the hills, road cuts and town flattening the game adds at run time are not in it, and the viewport says so. Without WOODS.WLD there is no ground: the grid is exact metres from the POI and a banner says it is not the terrain. View menu: grid, ground, collision overlay. Arrange: drop to ground, move by (numeric), hang a mount on a surface.
- **2D canvas** (`src/flat2d.js`, `ui/canvas2d.js`): pivot by click with snapping and presets, mirror (the game's own rule: more than a quarter turn faces the other way; mounts never mirror), turn or spin, layer back/forward/to front/to back with a layer list, backdrops, pixel read-out.
- **Interior** (`src/interior.js`): the room shell and the built-in pieces taken out (the game's `m<placement>:<model>` and `f<flat>:<archive>.<record>` names, at most 200), a flat's own light, the hanging-lantern flame height, and mounts hung off a surface's normal.

DM suite (Milestone 4), in the DM view (`ui/dm.js`, `ui/eventGraph.js`, `src/spline.js`, and the game's `src/poi/poiDmEdit.js`, which the in-game editor's DM panel uses too):

- One tab each for people (route, dialogue, trade, talk range, shown-when), routes and waypoints, encounters and spawn points (the game's own enemies, optional exact level), objects (chest, door, switch, quest object, zone), dialogues (lines, answers, conditions, cooldowns), trades (recipes with item stacks from the catalog, gold, limits, stock), events (trigger, condition tree, then and else actions), and variables.
- Picking a spot (waypoint, spawn, centre, object) switches to the 3D view, takes one click on the ground (snapped, on the terrain when there is one) and comes back. Esc cancels.
- The 3D view draws routes as splines with reach rings, wait times and the person-to-route link, encounters with their spawn rings, zones and objects. View > routes, zones and encounters toggles it.
- The event graph shows what starts each event (a zone, a person, a route stop, an encounter, a trade, an answer) and which events an event runs.
- Deleting a row something needs is refused with who needs it; links that may be left out are cleared with it.
- Everything is checked against `poiLawV2.js` and the item rules in `poiTradeLaw.js`. The game runs DM content on approved POIs; the DM view says so and points to the Sandbox.
- `tools/poiDmExamples.test.mjs` builds the four spec scenarios only through these functions, on real item and enemy ids.

Not built yet: the UV editor (its tab is disabled), `.glb` export, and crafting stations (the asset browser
refuses a station: "House stations belong to house decoration, not to a POI.").
Uploaded model parts (`mesh`) are drawn as boxes.

## Files

- `src/scene.js`, `clipboard.js`, `catalogue.js`, `place.js`, `transforms.js`, `camera.js`, `api.js`, `terrain.js`, `flat2d.js`, `interior.js`, `spline.js`: pure modules, tested.
- `src/ui/`: the panels and the WebGL viewport.
- `scripts/buildAssetCatalogue.mjs`: rebuilds `public/asset-catalogue.json` and `public/thumbs/` from ARENA2.
- `SCHEMA-V2.md`, `AUDIT-MAP.md`, `ASSET-AUDIT.md`: the document law, the repo audit and the asset audit.

## Checks

    node --test tools/poiLaw.test.mjs tools/poiEditorFoundation.test.mjs tools/poiEditorTerrain.test.mjs tools/poiDmExamples.test.mjs
    ARENA2_PATH=... node tools/poiEditorProbe.mjs        # headless Chromium, fails on any console error
