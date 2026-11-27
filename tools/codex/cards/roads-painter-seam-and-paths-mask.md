---
slug: roads-painter-seam-and-paths-mask
title: "Road Painter Seam, Tile Tables, Height Smoothing, and Paths Mask"
domain: world
kind: subcard
parent: roads-network-overview
files:
  - src/world/roadPainter.js
  - src/world/terrainGen.js
  - src/world/terrainTiles.js
  - src/world/pixelBuild.js
  - src/render/labGrass.js
  - src/world/terrainNature.js
  - src/world/terrainGenClient.js
routes: []
tables: []
replacesBible:
  - "03-World/Roads.md"
related:
  - roads-network-overview
  - roads-verge-clearance-and-tree-fit
  - bantha-jungle-trails-and-roadside-pairs
invariants:
  - "The one seam: in terrainGen, blendLocationTerrain runs, then generateTileData classifies ground, then paintRoads runs before marching squares. With no network, the pipeline is byte-for-byte unchanged."
  - "Paint order matches the mod: roads, then rivers and streams if `water`, then tracks. The first painter of a tile wins."
  - "ROAD_TILES: cardinal and diagonal inner 46. Diagonal outer 47/55. Cardinal outer, diagonal gap and inside corner are null."
  - "TRACK_TILES: cardinal inner 11/26, diagonal inner 51/52, diagonal outer 12/27, inside corner 10/25. Column 0 (water) is 0. NC (no change) over dirt."
  - "paintRoads writes a 128x128 `paths` Uint8Array, one byte per tile it wrote, including NO_CHANGE track-on-dirt tiles. Grass and forest placers read it because records 10/11/12/51 are ambiguous with natural dirt edges."
  - "smoothRoadHeights runs after the paint and skips the location rect. It is gated by `roads.smooth` is not `false`."
traps:
  - "Never exclude grass by record number to clear paths (grassRecordsOf). Use the `paths` mask from the painter."
  - "Heightmap index is y + x*hDim, while tilemap index is x + y*tDim. The skip rect in the smoother is max-exclusive."
  - "The road network object is assembled at several sites in the client and worker; a field such as `smooth`, `water`, or `source` added to one site is silently ignored on the path the game actually takes."
  - "A pixel built before the road network landed is rebuilt inside the same call and the rebuilt entry is returned, once; returning nothing breaks the boot path, which awaits the player's pixel entry."
dfu: []
tags:
  - roads
  - tilemap
  - marching-squares
  - grass
  - terrain-gen
---

# Road Painter Seam, Tile Tables, Height Smoothing, and Paths Mask

Terrain generation inserts road and track painting through one seam between ground classification and marching squares, producing a `128x128` `paths` mask and smoothed road heights (`src/world/roadPainter.js`, `src/world/terrainGen.js`).

## Painter Seam and Tile Tables

- **Terrain pipeline seam (`src/world/terrainGen.js`, `src/world/terrainTiles.js`):** After `blendLocationTerrain` and `generateTileData`, `paintRoads` runs before marching squares. With no network, terrain output is byte-for-byte identical.
- **First-writer paint order (`src/world/roadPainter.js`):** Using module-private `paintPath` and `paintPathWithSubPathJoins` with corner byte `pathCorners(mask, x, y) = (east & 0x5) | (west & 0x50)`, `paintRoads` paints roads first, rivers and streams next (if `water` is enabled), and tracks last. The first painter of a tile wins.
- **Tile tables (`src/world/roadPainter.js`):** `ROAD_TILES` uses record `46` for cardinal and diagonal inner tiles, `47`/`55` for diagonal outer tiles, and `null` for cardinal outer, diagonal gap, and inside corner tiles. `TRACK_TILES` uses `11`/`26` (cardinal inner), `51`/`52` (diagonal inner), `12`/`27` (diagonal outer), `10`/`25` (inside corner), `0` in column `0` (water), and `NO_CHANGE` (`NC`) over dirt.

## Paths Mask and Height Smoothing

- **Disambiguating dirt and grass (`src/world/pixelBuild.js`, `src/render/labGrass.js`, `src/world/terrainNature.js`):** `paintRoads` outputs a `128x128` `paths` `Uint8Array` marking every painted tile (including `NO_CHANGE` track-on-dirt tiles). Grass (`grassRecordsOf`) and tree placers read `paths` because records `10`, `11`, `12`, and `51` also occur on natural dirt edges.
- **Road height smoothing (`src/world/roadPainter.js`):** When `roads.smooth` is not `false`, `smoothRoadHeights` smooths painted tiles outside the max-exclusive location rect (`y + x * hDim` for heightmaps, `x + y * tDim` for tilemaps).
