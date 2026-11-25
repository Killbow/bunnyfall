---
slug: merchant-yards-placement-and-ground
title: "Merchant Yard Siting on Town Ground"
domain: world
kind: subcard
parent: merchant-yards-overview
files:
  - src/world/merchantYards/merchantYardSites.js
  - src/world/townPlacesWorld.js
  - src/world/pixelBuild.js
  - src/world/cityNavigation.js
  - src/world/flatFields.js
  - src/world/arenaCity.js
  - src/homes/homeYards.js
  - src/talk/talkTopics.js
routes: []
tables: []
replacesBible:
  - "03-World/Merchant-Yards.md"
related:
  - merchant-yards-overview
  - merchant-yards-trade-keepers-and-discovery
  - shipyards-port-town-siting
invariants:
  - "YARD_FOOT half extents: stable { hx 7, hz 5.75 } (14 x 11.5 m), transport { hx 9, hz 6.75 } (18 x 13.5 m), carpenter { hx 7, hz 6 } (14 x 12 m); front is local +z, turned by YARD_TURNS [0, 90, 180, 270]."
  - "yardGround clearances: BUILDING_CLEAR_M 6 around building boxes, PROP_CLEAR_M 1 around other models and crop fields (fieldRect), FLAT_CLEAR_M 0.8 around flats, MONUMENT_KEEP_M 8 around the monument."
  - "A yard's own cells must be open and off roads; a YARD_PAD_M (NAV_CELL) ring must be open but may be road."
  - "Score = distance to block-grid center + NO_ROAD_COST 12 when no road lies within FRONT_ROAD_CELLS 2 of the front; ties go to lower row, then column, then turn."
  - "Order on one ground: yardSitesOn (stable, transport, each closeSite with YARD_GAP_M 3), then portSitesOn, then craftYardSitesOn (carpenter)."
traps:
  - "Distances use Math.sqrt of exact sums, never Math.hypot: Math.hypot differs per engine and split ties across browsers."
  - "Palace blocks (blockBuildingCount over buildingDataList) and the ARENA_BLOCK colosseum are closedBlock and get no yard."
  - "Town-mod models are measured with placedModelBox (custom geometry first, then ARCH3D size); skipping it put yards on mod props."
dfu: []
tags:
  - merchant-yards
  - placement
  - navgrid
  - determinism
---

# Merchant Yard Siting on Town Ground

Deterministic block-grid scoring places merchant yards on open town ground and carves their footprints out of the pedestrian navgrid (`src/world/merchantYards/merchantYardSites.js`, `src/world/townPlacesWorld.js`, `src/world/pixelBuild.js`).

- **Footprints, clearances, and closed blocks (`src/world/merchantYards/merchantYardSites.js`, `src/world/cityNavigation.js`, `src/world/flatFields.js`, `src/world/arenaCity.js`, `src/homes/homeYards.js`):** `townGroundOf` builds a `CityNavigation` grid (`enhancedWater:true`) for `yardGround`. `YARD_FOOT` half-extents are `stable` `{hx:7,hz:5.75}` (`14x11.5` m), `transport` `{hx:9,hz:6.75}` (`18x13.5` m), and `carpenter` `{hx:7,hz:6}` (`14x12` m) with local `+z` front turned by `YARD_TURNS` `[0,90,180,270]`. Clearances enforce `BUILDING_CLEAR_M=6` around buildings, `PROP_CLEAR_M=1` around models (`placedModelBox` measures custom geometry before `ARCH3D`) and crop fields (`fieldRect`), `FLAT_CLEAR_M=0.8` around flats, and `MONUMENT_KEEP_M=8` around monuments. Palace blocks (`blockBuildingCount`) and `ARENA_BLOCK` are `closedBlock`.
- **Scoring, placement order, and navgrid carving (`src/world/merchantYards/merchantYardSites.js`, `src/world/townPlacesWorld.js`, `src/world/pixelBuild.js`, `src/talk/talkTopics.js`):** Yard cells must be open and off-road with an open `YARD_PAD_M` (`NAV_CELL`) ring. Score equals `Math.sqrt` distance to grid center (never `Math.hypot`) plus `NO_ROAD_COST=12` without road within `FRONT_ROAD_CELLS=2`, breaking ties by row, column, and turn. `townPlacesFor` (`yardMeasuresOf`, memoizing `8` towns) runs `yardSitesOn` (`stable`, `transport`, `closeSite` with `YARD_GAP_M=3`), `portSitesOn`, and `craftYardSitesOn` (`carpenter`), logging `[yards] <town>: no room for ...` on shortfall, while `carveYards` closes pedestrian navgrid cells.
