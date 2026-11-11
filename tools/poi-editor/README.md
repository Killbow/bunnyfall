# World Builder

A standalone editor for Bunnyfall POIs (points of interest). It replaces the in-game editor at `/play/?editor`.
This is Milestone 2: the editor foundation. The DM tools (routes, dialogue, trades, encounters, events) come in
Milestone 4 and the game runtime in Milestone 5, so they are not in the editor yet.

## Run it

    ARENA2_PATH=/path/to/arena2 npm run poi-editor      # http://localhost:5180/editor.html
    npm run build:poi-editor                            # builds to dist-poi-editor/

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
  selection. The 3D view draws the POI's own frame in metres and says it has no terrain.
- **Scene:** groups, show and hide, lock, rename, drag to regroup, shift and ctrl selection.
- **Edit:** Ctrl+C, X, V, D, G, A, Delete and 200 steps of undo and redo. The clipboard is JSON in `localStorage` and in
  the system clipboard, so it crosses POIs and tabs. A paste leaves out an asset the catalogue lacks and says so.
- **Server:** sign in, open a POI from the store, save a draft, submit it, load its revisions.
- **Law:** the Problems tab runs the same law as the server (`src/poi/poiLaw.js`, `poiLawV2.js`, `poiTradeLaw.js`).

World and decoration (Milestone 3):

- **Ground** (`src/terrain.js`): WOODS.WLD read through the game's own sampler and surface read. It is the game's BASE terrain; the hills, road cuts and town flattening the game adds at run time are not in it, and the viewport says so. Without WOODS.WLD there is no ground: the grid is exact metres from the POI and a banner says it is not the terrain. View menu: grid, ground, collision overlay. Arrange: drop to ground, move by (numeric), hang a mount on a surface.
- **2D canvas** (`src/flat2d.js`, `ui/canvas2d.js`): pivot by click with snapping and presets, mirror (the game's own rule: more than a quarter turn faces the other way; mounts never mirror), turn or spin, layer back/forward/to front/to back with a layer list, backdrops, pixel read-out.
- **Interior** (`src/interior.js`): the room shell and the built-in pieces taken out (the game's `m<placement>:<model>` and `f<flat>:<archive>.<record>` names, at most 200), a flat's own light, the hanging-lantern flame height, and mounts hung off a surface's normal.

Not built yet, and shown as such: the UV editor (the editor has no mesh import yet), packs and `.glb` export, the DM sandbox, crafting stations (they need a runtime first).
Uploaded model parts (`mesh`) are drawn as boxes until their import lands.

## Files

- `src/scene.js`, `clipboard.js`, `catalogue.js`, `place.js`, `transforms.js`, `camera.js`, `api.js`, `terrain.js`, `flat2d.js`, `interior.js`: pure modules, tested.
- `src/ui/`: the panels and the WebGL viewport.
- `scripts/buildAssetCatalogue.mjs`: rebuilds `public/asset-catalogue.json` and `public/thumbs/` from ARENA2.
- `SCHEMA-V2.md`, `AUDIT-MAP.md`, `ASSET-AUDIT.md`: the document law, the repo audit and the asset audit.

## Checks

    node --test tools/poiLaw.test.mjs tools/poiEditorFoundation.test.mjs tools/poiEditorTerrain.test.mjs
    ARENA2_PATH=... node tools/poiEditorProbe.mjs        # headless Chromium, fails on any console error
