---
slug: eltheric-ocean-isles-places-and-depth-bake
title: "Eltheric Isles, Places, and the Seabed Bake"
domain: world
kind: subcard
parent: eltheric-ocean-overview
files:
  - src/world/ethericSea.js
  - src/world/etherPlaces.js
  - src/world/etherWatersBake.js
  - src/world/deepWatersBake.js
  - src/world/deepWatersClient.js
  - src/systems/naval/etherHost.js
  - src/ui/etherChartWindow.js
  - src/systems/naval/tradeGoods.js
routes: []
tables: []
replacesBible:
  - "03-World/Eltheric-Ocean.md"
related:
  - eltheric-ocean-overview
  - professions-gathering-nodes-and-motherlodes
  - market-vendors-and-professions
  - pixel-streaming-and-origin-shift
invariants:
  - "Isles sit on an `ISLE_CELL_PX` (`10`) pixel lattice. At most one isle per cell is rolled by `etherHash` (FNV-1a seeded with `ETHER_SALT = 0xe7e4`) and `etherRng` (mulberry32)."
  - "No isle spawns in edge cells (`EDGE_CELLS = 1`) or in any cell east of `VEILHAVEN_CELL`, four cells west of the Veil column on the middle row (`Math.floor(CELLS_H / 2)`)."
  - "Isle place IDs use lane `ETHER_PLACE_SALT` (`0xe7`) in the high 12 bits, start from `ETHER_PLACE_BASE` (`500000`), and report region `ETHER_REGION` (`19`, Betony)."
  - "`EtherWatersBake extends DeepWatersBake` over `ETHER_FRAME`, building planes lazily and flooding one isle cell at a time across the roughly forty-million-pixel box."
  - "`etherTemplates` sorts each template list by map id and `etherTemplateOf` picks by `etherHash(isle.seed, 11)`, so every client clones the same game place onto an isle."
traps:
  - "Changing `ETHER_SALT` moves every procedural isle and invalidates saved `\"cx,cy\"` isle keys."
  - "Port isles center their land on the town pixel middle (`landCentre`) so the shore sits about `ETHER_PORT_SHORE_M` (`900`) meters out; shrinking that radius puts water past `ETHER_HARBOUR_REACH` and prevents quay placement."
  - "Location templates are cached objects shared with the exterior layout, so `synthesizeEtherLocation` copies every nested object it changes and must never mutate the template."
dfu: []
tags:
  - eltheric-ocean
  - isles
  - procedural
  - deep-waters
  - etherPlaces
---

Procedural islands, town placements, charts, and seabed geometry in the Eltheric Ocean are handled by `src/world/ethericSea.js`, `src/world/etherPlaces.js`, `src/world/etherWatersBake.js`, `src/systems/naval/etherHost.js`, and `src/ui/etherChartWindow.js`.

## Procedural Lattice and Isle Kinds

The ocean grid divides into `ISLE_CELL_PX` (`10`) map-pixel cells. `etherHash` (FNV-1a seeded with `ETHER_SALT = 0xe7e4`) and `etherRng` (mulberry32) roll at most one isle per cell, keeping `EDGE_CELLS` (`1`) and every column east of `VEILHAVEN_CELL` (four cells west of the Veil on row `Math.floor(CELLS_H / 2)`) clear. Up to `ISLE_CACHE_MAX` (`65536`) cells are cached before the cache clears as a whole. `src/ui/etherChartWindow.js` displays up to `ETHER_CHARTED_MAX` (`4096`) charted cells across `CHART_ZOOMS` (`[1, 2, 4, 8, 16]`).

`ISLE_KINDS` defines `port`, `ruin`, `wild`, and `rock` islands with distinct radius ranges, peak heights, falloff curves (`fall`), and climate lists. Wild isles can produce `ETHER_GOODS` (`etheramber`, `starglass`, and `voidsilk`), which `src/systems/naval/tradeGoods.js` prices with `EXOTIC_K = 1.4`.

## Places and Seabed Baking

`src/world/etherPlaces.js` assigns place IDs starting at `ETHER_PLACE_BASE` (`500000`) with lane `ETHER_PLACE_SALT` (`0xe7`) in the high 12 bits, reporting region `ETHER_REGION` (`19`, Betony). `TOWN_BLOCKS` gives standard ports `[2, 6]` blocks and Veilhaven `[6, 12]` blocks, while ruins in `ELITE_BANDS` (`deep` and `abyss`) roll elite layouts. Port land centers on `landCentre` so the shoreline sits roughly `ETHER_PORT_SHORE_M` (`900`) meters out, within `ETHER_HARBOUR_REACH`.

Because `ETHER_FRAME` spans roughly forty million pixels, `EtherWatersBake` (`extends DeepWatersBake`) allocates planes lazily, floods one isle cell at a time, and applies the 210-meter deep bathymetry profile off coasts.
