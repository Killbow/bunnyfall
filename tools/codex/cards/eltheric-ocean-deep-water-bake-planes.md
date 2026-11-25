---
slug: eltheric-ocean-deep-water-bake-planes
title: "Eltheric Deep-Water Bake Plane Bounds and Sea Reads"
domain: world
kind: subcard
parent: eltheric-ocean-watch-and-bake-guards-overview
files:
  - src/world/deepWatersBake.js
  - src/world/etherWatersBake.js
  - src/world/deepWatersClient.js
  - src/world/deepWatersWorker.js
  - src/underwater/deepWatersHost.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Ether-OW.md"
related:
  - eltheric-ocean-watch-and-bake-guards-overview
  - eltheric-ocean-isles-places-and-depth-bake
invariants:
  - "adoptPlanes is bounded by PLANE_KEEP_MAX and PLANE_KEEP_RADIUS (read live values from deepWatersBake.js)."
  - "Host dry check reads only sea bits the thread holds (holdsSea); flooding fresh cells is the worker's job."
  - "readLargeWindow reads raw bytes directly for Bay pixels instead of the allocating sea door."
  - "Bake frames read through waterFrameOf."
traps:
  - "Unbounded adoptPlanes grows main-thread planes over long voyages."
dfu: []
tags:
  - deep-water
  - bake
  - planes
  - performance
---

# Eltheric Deep-Water Bake Plane Bounds and Sea Reads

`src/world/etherWatersBake.js` and `src/world/deepWatersBake.js` compose the procedural Eltheric Ocean bathymetry over the Iliac Bay seabed bake without altering Bay output bytes or leaking plane allocations during extended voyages.

## Plane Retention Bounds and Frame Routing

- **Bounded plane adoption (`src/world/deepWatersBake.js`, `src/world/deepWatersClient.js`):** When the main thread adopts baked seabed planes from `src/world/deepWatersWorker.js`, `adoptPlanes` enforces `PLANE_KEEP_MAX` and `PLANE_KEEP_RADIUS` around the active focus. Pruning distant planes prevents unbounded memory growth on the main thread during long open-sea voyages across the Eltheric box, and Bay rows are never adopted past the Veil.
- **Frame routing (`waterFrameOf`):** All bake frame lookups resolve through `waterFrameOf`, keeping Bay and Eltheric coordinate frames isolated so Bay seabed bytes remain unchanged when Eltheric planes load.

## Non-Allocating Sea Reads and Worker Flooding

- **Thread-local dry check (`src/underwater/deepWatersHost.js`):** The main-thread dry check inspects only the sea bits already held in memory on that thread via `holdsSea`; flooding fresh isle cells is delegated exclusively to the background worker (`src/world/deepWatersWorker.js`).
- **Direct Bay window reads (`readLargeWindow`):** Within `src/world/deepWatersBake.js` and `src/world/etherWatersBake.js`, `readLargeWindow` reads raw underlying bytes directly for Bay pixels rather than routing through the allocating sea door.
