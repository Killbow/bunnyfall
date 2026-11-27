---
slug: "terrain-water-bed-and-halo-overview"
title: "Terrain Water Bed Carve, Halo Tiles, and Sheet Depths"
domain: "rendering"
kind: "overview"
parent: null
files:
  - "src/world/waterBed.js"
  - "src/world/waterCorners.js"
  - "src/world/waterRipples.js"
  - "src/render/waterSurface.js"
  - "src/world/terrainGen.js"
  - "src/world/terrainTiles.js"
  - "src/scenes/world.js"
  - "src/underwater/deepWatersWorld.js"
  - "src/world/rmbLayout.js"
  - "src/world/puddleDry.js"
  - "src/world/puddleMask.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-WATER-NEXT.md"
related:
  - "terrain-water-ripples-wake-and-shader"
  - "deep-waters-overview"
  - "captains-sea-overview"
  - "landforms-terrain-shaper-overview"
invariants:
  - "Terrain water beds carve on the terrain worker inside `restrideGrid`, never on the main CPU frame thread."
  - "`BED_HALO_TILES` (`ceil(BED_RAMP / TILE_UNITS) + 1 = 4` neighbor tiles at `BED_RAMP = 19.2`, `TILE_UNITS = 6.4`) classifies shore neighbors via `tileDataAt` and `marchTile`."
  - "`bedBytesOf(p)` reads `p._dwBytes ?? p.tilemapBytes` and `dwRecarve` recarves from the grid when the Deep Waters cap lands or lifts, while `sheetDepthsOf` writes `SHEET_NO_BED = -NO_BED_DEPTH` over uncarved ground (tint only, no swell)."
  - "`GROUND_RECORD_LIMIT = 56` is the shared ground-marker ceiling across terrain stamps, `rmbLayout.js`, fixed towns, and `puddleDry.js`."
  - "`dryPuddles` runs once inside `getBlock` in blocksFile.js so every reader of a block sees dried ground. Do not add a second call or dry a block outside that path."
  - "`turnFraction` must match `PUDDLE_ROT` and `PUDDLE_TRANS` in render/waterSurface.js. The puddle mask is stored in the ground tile array's alpha channel, which every other reader ignores."
  - "`WATER_MASK_TABLE` is DFU's physics table for swimming and town navigation; records that only look like water belong in `WATER_DRAW_MASK_TABLE`, because adding them to the physics table would change physics."
traps:
  - "`WATER_OPACITY` was retired; do not reintroduce a uniform opacity floor on exterior water."
  - "Interiors (`worldModes.js`) and dungeons (`dungeonContext.js`) stay on classic `drawWater` (`WATER_SCROLL_TILES_PER_SEC = 0.05` applies to dungeon water only)."
dfu:
  - "Assets/Scripts/Utility/AssetInjection/MeshReader.cs"
tags:
  - "water"
  - "terrain"
  - "rendering"
  - "deep-waters"
---

# Terrain Water Bed Carve, Halo Tiles, and Sheet Depths

Exterior terrain water beds carve off-thread in `src/world/waterBed.js` and `src/world/waterCorners.js`, feeding sheet meshes and depth buffers to `src/render/waterSurface.js` and `src/world/waterRipples.js`.

- **Worker carve and halo borders:** Terrain water beds carve on the terrain worker inside `restrideGrid` (`src/world/terrainGen.js`, `src/world/terrainTiles.js`), keeping `hostBed` equipped with `sheet`, `normals`, `depths`, `sheetDepths`, and `halo`. `BED_HALO_TILES` (`ceil(BED_RAMP / TILE_UNITS) + 1 = 4` neighbor tiles at `BED_RAMP = 19.2` and `TILE_UNITS = 6.4`) classifies shore neighbors via `tileDataAt` and `marchTile`.
- **Deep Waters recarve and ground ceiling:** `bedBytesOf(p)` reads `p._dwBytes ?? p.tilemapBytes`, and `dwRecarve` (`src/scenes/world.js`, `src/underwater/deepWatersWorld.js`) recarves from the grid when the Deep Waters cap lands or lifts. `sheetDepthsOf` writes `SHEET_NO_BED = -NO_BED_DEPTH` over uncarved ground so shallow sheets tint without vertical swell. `GROUND_RECORD_LIMIT = 56` bounds ground markers across terrain stamps, `src/world/rmbLayout.js`, fixed towns, and `src/world/puddleDry.js`.
- **Render modes and classic fallback:** Simple water (`?air=off`) skips frame-copy and ripples while retaining blended look-through without any uniform `WATER_OPACITY` floor, whereas interiors and dungeons stay on classic `drawWater` (`WATER_SCROLL_TILES_PER_SEC = 0.05` for dungeon water only).
