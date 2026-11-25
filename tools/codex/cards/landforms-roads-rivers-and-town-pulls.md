---
slug: landforms-roads-rivers-and-town-pulls
title: "Landforms: Road Cuts, River Channels, Town Pulls, and Road Easing"
domain: world
kind: subcard
parent: landforms-terrain-shaper-overview
files:
  - src/world/landforms.js
  - src/world/roadNetwork.js
  - src/world/roadPainter.js
  - src/world/terrainTiles.js
  - src/world/terrainGen.js
  - src/platform/onlineLane.js
  - src/mods/modSettings.js
routes: []
tables: []
replacesBible:
  - "03-World/Landforms.md"
related:
  - landforms-terrain-shaper-overview
  - roads-network-overview
  - roads-painter-seam-and-paths-mask
  - landforms-climate-hills-and-mountain-peaks
invariants:
  - "Paths are graded to kernel macro height (both bicubic terms, lift, hills, and site pull, without ground noise) along 65 profile points (`half + 1`) per road arm."
  - "Lerp order is stream, river, track, road (last wins); paint order in roadPainter.js is the reverse precedence."
  - "In a water channel a road keeps only its own bed (a causeway); its bank and verge yield. A track yields its bed too, so it is a ford."
  - "Rivers and streams are cut only where painted (`roads.water`); online, roads-hazelnut RiversAndStreams is forced true via ONLINE_ROOM_MOD_KEYS (src/platform/onlineLane.js:313)."
  - "Cuts fade in over `coast` = 12 units above the knee so a path meets the beach without a step."
traps:
  - "A road or track bank is held within bankHold = bankGrade 0.5 * (TERRAIN_SIZE / 128 / 1.25) * bank / 1.5 of the smooth land; river and stream floors are never held (hold = Infinity)."
  - "A town's upward pull is eased by smoothstep((land - knee) / (level - knee)), or coastal towns grow walls at the beach line."
  - "siteLevel averages only land over the knee; counting sea and beach sank coastal towns under the beach."
dfu:
  - Assets/Scripts/Terrain/TerrainHelper.cs
tags:
  - landforms
  - roads
  - rivers
  - towns
  - terrain
---

# Landforms: Road Cuts, River Channels, Town Pulls, and Road Easing

Before paths cut the terrain, town footprints pull nearby ground toward a shared level, and road and river arms grade macro elevation across the pixel (`src/world/landforms.js`, `src/world/terrainTiles.js`).

- **Town site pulls (`src/world/landforms.js`, `src/world/terrainTiles.js`):** `landformSites(rows)` packs four bytes per map pixel (`xMin`, `xMax`, `yMin`, `yMax+SITE_BIAS` with `SITE_BIAS=16`) from `locationFootprintRect` for game rows, reading replaced locations via `MapsFile.readClassicLocation`. `sitesAbout` scans the `5x5` pixel neighborhood in global order using `site` dials `{reach:40,per:3,most:124,grid:8}` (`reach=min(most,reach+per*halfExtent)`). `siteLevel` averages only land above `LANDFORM_KNEE`. `pullTo` sets `weight=1-smoothstep(d/reach)`, blends site levels by `weight^4` with `keep=product(1-weight)`, and eases upward pulls by `smoothstep((land-knee)/(level-knee))`.
- **Path grading, channels, and easing (`src/world/landforms.js`, `src/world/roadNetwork.js`, `src/world/roadPainter.js`, `src/world/terrainGen.js`, `src/platform/onlineLane.js`, `src/mods/modSettings.js`):** Paths grade to macro height across `65` profile points (`half+1`) per arm with `LANDFORM7` easing `{road:40,track:28,keep:0.35}` samples (`256` m / `179` m) and valley carve `{river:120,stream:96}` samples. Cross-sections `(flat,bank,verge,drop)` are `stream` `(1,1.25,4,0.8)`, `river` `(2,1.5,6,1.92)`, `track` `(1.25,2,5,0)`, and `road` `(1.25,2.5,6,0)`, fading in over `coast=12` units above the knee. Layers lerp `stream`, `river`, `track`, `road` (last wins, reverse of `roadPainter.js`). Across water (`roads.water`, forced online via `ONLINE_ROOM_MOD_KEYS`), roads keep their bed as causeways while tracks yield as fords, and `bankHold` caps track (`3.41` units) and road (`4.27` units) banks.
