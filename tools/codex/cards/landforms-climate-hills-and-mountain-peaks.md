---
slug: landforms-climate-hills-and-mountain-peaks
title: "Landforms: Rolling Hills, Climate Shapes, and Sharp Mountain Peaks"
domain: world
kind: subcard
parent: landforms-terrain-shaper-overview
files:
  - src/world/landforms.js
  - src/world/perlin.js
  - src/formats/mapsTables.js
  - src/world/ethericSea.js
routes: []
tables: []
replacesBible:
  - "03-World/Landforms.md"
related:
  - landforms-terrain-shaper-overview
  - landforms-roads-rivers-and-town-pulls
  - biome-precipitation-snowpack-and-ground
invariants:
  - "Hills are centered per land via `LAND_NORMS` and saturated past `SAT_KNEE` (0.6) so mean height matches the DFU lifted mean."
  - "Hills ease in over `hills.coast` (1.25) times the tallest hill of the land above the knee so no hill or dale crosses the beach line."
  - "Only cosPi, sinPi and expNeg (series-evaluated, within 4.5e-16 of V8) are used; Math.cos/sin/exp/pow are banned from ground math so every engine produces the same float."
  - "Slow fields (region, warp, rock) are read on a HILL_NODE = 16 sample lattice placed on world positions."
traps:
  - "PEAK_MEAN_SHARP is PEAK_MEAN / (6 * (0.5 - 2/pi^2)), not the literal 1/6."
  - "Adding a land without measuring a LAND_NORMS entry shifts that climate's average ground (the foothills were once 13-18 m low)."
  - "Use `r * r`, never `r ** 2` (an engine's own pow) in shaper math."
dfu: []
tags:
  - landforms
  - hills
  - climate
  - mountains
  - determinism
---

# Landforms: Rolling Hills, Climate Shapes, and Sharp Mountain Peaks

Climate-shaped hills and peaks add deterministic relief above the beach line while preserving the DFU lifted mean height (`src/world/landforms.js`, `src/world/perlin.js`).

- **Climate blending, lattice, and determinism (`src/world/landforms.js`, `src/formats/mapsTables.js`, `src/world/ethericSea.js`):** `landShares` bilinearly blends the four nearest map-pixel climates with smoothstep weights over `landformClimates` (`CLIMATE.PAK` after coastal dilation, or `etherClimateAt` in the Eltheric Ocean). Slow fields (`region`, `warp`, `rock`) sample on a `HILL_NODE=16` lattice under `hills` `{uplandAt:700,coast:1.25,region:2400,warp:80,warpScale:520,scales:[300,125,50],weights:[1,0.36,0.1]}`. Shaper math uses series-evaluated `cosPi`, `sinPi`, `expNeg`, integer `cellHash` (`Math.imul`), and `r*r`, banning `Math.cos`, `Math.sin`, `Math.exp`, `Math.pow`, and `r**2`.
- **Land norms and climate shapes (`src/world/landforms.js`):** Hills center via `LAND_NORMS`, saturate past `SAT_KNEE` (`0.6`), and ease over `hills.coast` (`1.25`) times the tallest hill above `LANDFORM_KNEE`. Profiles `(low/high/upland)` span `woodlands` (`4/48/1.6`), `mountainWoods` (`8/56/1.6`, peaks `{380,0.34,112}`), `mountain` (`16/112/1.6`, sharp `(1-q)^2` peaks `{cell:360,fill:0.5,high:320}` using `PEAK_MEAN_SHARP=PEAK_MEAN/(6*(0.5-2/pi^2))`), `desert` (`6/26/1.3`, `rockFrom:0.3`), `desert2` (`6/30/1.3`, `rockFrom:-0.1`), `rainforest` (knolls `120/0.88`), `subtropical` (knolls `210/1`), `swamp` (`2/6`), `haunted` (`6/40/1.5`), and `ocean` (`2/24`), with `HILLS_TOP=499.2` units (`624` m), ridges (`RANGE_A=0.6`, `RANGE_B=-0.55`, `RANGE_STRETCH=2.2`), and dunes (`DUNE_WIND=0.35`, `DUNE_SPACING=64`, `DUNE_WINDWARD=0.72`).
