---
slug: enhanced-maps-automap-storeys-and-sheets
title: "Enhanced Automap: Storeys From Triangles, Sheets and Stairs"
domain: ui
kind: subcard
parent: enhanced-maps-overview
files:
  - src/maps/automapFloors.js
  - src/ui/automapSheet.js
  - src/ui/inkAutomap.js
  - src/ui/automapWindow.js
  - src/ui/automapDoor.js
  - src/world/dungeonLayout.js
routes: []
tables: []
replacesBible:
  - "10-UI/Enhanced-Maps-Arc.md"
related:
  - enhanced-maps-overview
  - gather-hover-lock-and-automap-layout-keep
  - held-map-ink-cartography-and-zoom-bands
invariants:
  - "Daggerfall blocks carry no floor field, so storeys are derived from revealed triangles in src/maps/automapFloors.js."
  - "LEVEL_NY = cos(20 deg) gates which triangles may vote for a storey; FLOOR_NY = cos(SLOPE_LIMIT_DEG) gates which are drawn."
  - "FLOOR_MIN_GAP = CAPSULE_HEIGHT + 1.2; MIN_TRI_AREA = 0.05."
  - "A ramp is walked and drawn but votes for nothing; its triangles split to the nearest storey (surfaceY), so it lands on both."
  - "Facing guard skips triangles unless `len > 0` so `NaN` vertices are rejected."
  - "Per-level frames are cached in a `WeakMap` keyed on the reveal index `rows` array, built once per level (`src/ui/automapSheet.js`)."
traps:
  - "Never key the frame cache on the model wrapper; it changes every frame."
  - "Do not let ramp triangles vote: every dungeon has ramps and stairs, and they would mint false storeys."
dfu: []
tags:
  - automap
  - storeys
  - dungeon
  - disc25-a
  - enhanced-map
---

# Enhanced Automap: Storeys From Triangles, Sheets and Stairs

Because Daggerfall dungeon and interior blocks carry no explicit floor attribute, the enhanced automap (`src/maps/automapFloors.js`, `src/ui/automapSheet.js`, `src/ui/inkAutomap.js`) derives discrete storeys and clickable stairs directly from revealed floor triangles.

- **Triangle Voting and Ramp Splitting (`src/maps/automapFloors.js`, `src/world/dungeonLayout.js`):** A facing guard rejects degenerate or `NaN` vertices unless normal length `len > 0` and area meets `MIN_TRI_AREA = 0.05`. `LEVEL_NY = cos(20 deg)` gates which flat triangles vote for storey elevations separated by at least `FLOOR_MIN_GAP = CAPSULE_HEIGHT + 1.2`, whereas `FLOOR_NY = cos(SLOPE_LIMIT_DEG)` gates all walkable triangles drawn on the sheet. Ramp and stair triangles are walked and drawn (`FLOOR_NY`) but never vote (`LEVEL_NY`); each ramp triangle splits to its nearest storey by `surfaceY` so the ramp appears on both levels without minting false intermediate storeys.
- **Raster Outlines, Stair Links, and Sheet Packing (`src/maps/automapFloors.js`, `src/ui/inkAutomap.js`):** `levelField` rasterizes each storey into cells outlined by `boundarySegments` and `linkSegments` and softened with `roundCorners`. `storeyLinks` detects stairs and ramps connecting adjacent storeys (recorded from both sides) and draws them as clickable level transitions, while `groupSheets` packs non-overlapping storeys onto shared sheets.
- **WeakMap Frame Cache (`src/ui/automapSheet.js`, `src/ui/automapDoor.js`, `src/ui/automapWindow.js`):** Per-level frames cache in a `WeakMap` keyed on the reveal index `rows` array rather than the per-frame model wrapper.
