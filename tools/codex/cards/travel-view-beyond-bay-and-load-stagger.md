---
slug: "travel-view-beyond-bay-and-load-stagger"
title: "Travel View Beyond the Bay and Dungeon Load Stagger"
domain: "travel"
kind: "subcard"
parent: "snowless-climates-yards-and-house-signs-overview"
files:
  - "src/travel/travelRoute.js"
  - "src/travel/travelDungeonModels.js"
  - "src/travel/travelViewWorld.js"
  - "src/travel/travellerMarks.js"
  - "src/net/wire.js"
  - "src/weather/snowfallHost.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-09.md"
related:
  - "snowless-climates-yards-and-house-signs-overview"
  - "travel-view-overworld-overview"
  - "travel-view-routing-and-load-governor"
  - "travel-view-traveller-marks-and-hud"
  - "scale-arc-relay-hot-path-and-wire2"
invariants:
  - "planRoute's search box covers both the 1000x500 map and both endpoints; the beyond cache is capped by BEYOND_CACHE_MAX (1 << 16)."
  - "Wire coordinates pass worldPixelOk: integer and |v| < WORLD_PIXEL_BOUND (8192)."
  - "CELL_ROOM matches signed cell keys (world:-x,-y); cellHaloFor crosses the Bay corner in both directions."
  - "startDungeonLoads staggers loads one per frame, nearest first, after the view opens."
traps:
  - "Never hardcode the RELAY_VERSION literal; wire changes need the relay deployed before clients update."
dfu: []
tags:
  - "travel-view"
  - "wire"
  - "beyond"
  - "performance"
---

# Travel View Beyond the Bay and Dungeon Load Stagger

Travel View routing, wire coordinate validation, signed room cells, and staggered exterior dungeon model loading support continuous navigation across and beyond the classic `1000x500` Iliac Bay bounds.

- **Off-Map Water, Search Bounds, and Beyond Cache (`src/travel/travelViewWorld.js`, `src/travel/travelRoute.js`, `src/weather/snowfallHost.js`):** In `src/travel/travelViewWorld.js`, `tvWater` treats off-map pixels outside the Bay as water unless `shared.woods.isTamrielGround` or `etherLaw` applies. When `planRoute` (`src/travel/travelRoute.js`) builds an overland or maritime path, its search bounding box expands to cover both the classic `1000x500` map rectangle and both route endpoints, while the off-map query cache caps entries at `BEYOND_CACHE_MAX` (`1 << 16`).
- **Signed Wire Coordinates and Cell Halos (`src/net/wire.js`, `src/travel/travellerMarks.js`):** Network frames validate world pixel coordinates through `worldPixelOk`, requiring integer values with `|v| < WORLD_PIXEL_BOUND` (`8192`), which accommodates negative and extended coordinates outside the classic Bay grid. Room keys matched by `CELL_ROOM` accept signed cell coordinates (`world:-x,-y`), and `cellHaloFor` steps across the Bay origin corner in both positive and negative directions without clamping at zero. Deployments that alter wire rules must update the relay before clients roll out rather than hardcoding a version literal.
- **Dungeon Model Load Stagger (`src/travel/travelDungeonModels.js`):** When Travel View opens, `startDungeonLoads` sorts visible exterior dungeon markers by distance and staggers geometry loading to one model per frame, nearest first, preventing frame spikes on entry.
