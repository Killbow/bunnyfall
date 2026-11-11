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

Not built yet, and shown as such: the UV editor, terrain height, packs and `.glb` export, the DM sandbox.
Uploaded model parts (`mesh`) are drawn as boxes until their import lands.

## Files

- `src/scene.js`, `clipboard.js`, `catalogue.js`, `place.js`, `transforms.js`, `camera.js`, `api.js`: pure modules, tested.
- `src/ui/`: the panels and the WebGL viewport.
- `scripts/buildAssetCatalogue.mjs`: rebuilds `public/asset-catalogue.json` and `public/thumbs/` from ARENA2.
- `SCHEMA-V2.md`, `AUDIT-MAP.md`, `ASSET-AUDIT.md`: the document law, the repo audit and the asset audit.

## Checks

    node --test tools/poiLaw.test.mjs tools/poiEditorFoundation.test.mjs
    ARENA2_PATH=... node tools/poiEditorProbe.mjs        # headless Chromium, fails on any console error
