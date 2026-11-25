---
slug: "enhanced-ai-collider-soup-bake-and-anchors"
title: "Collider-Soup Bake, Cell Lock, Anchors, and the Bake Cache"
domain: "ai"
kind: "subcard"
parent: "enhanced-ai-arc-overview"
files:
  - "src/ai/navBake.js"
  - "src/ai/navmesh.js"
  - "src/ai/triRaster.js"
  - "src/ai/navClient.js"
  - "src/ai/navWorker.js"
  - "src/scenes/dungeonContext.js"
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Enhanced-AI-Arc.md"
related:
  - "enhanced-ai-arc-overview"
  - "enhanced-ai-routed-motor-and-flyer-aim"
  - "enemy-ai-navmesh-and-combat-tactics"
  - "indoor-watch-interior-navmesh-and-no-route"
invariants:
  - "`bakeNavFromCollider` (`src/ai/navBake.js`) reads collider triangles directly in world space so navmesh and physics share identical geometry."
  - "Soup bakes never coarsen. coarsenAgent (src/ai/navmesh.js:87) is reserved for open terrain, and bakeSoup keeps cs = 0.25 m."
  - "`SOUP_AGENT = { ...AGENT, radius: AGENT.cs }` (`src/ai/navBake.js`) erodes one `0.25` m cell ring rather than the `0.4` m open-terrain `AGENT` radius (`src/ai/navmesh.js`), keeping classic `1.25` m doorways passable."
  - "FLAT_EPS = 1e-4 (src/ai/triRaster.js:100) gives zero-thickness level floors a one-voxel span."
  - "landAnchors snaps anchors to a walkable span within ANCHOR_Y_TOLERANCE = 0.6 m in their own column or one of the 8 neighbors. regionAnchor passes a full 3D anchor to buildRegions."
  - "NAV_BAKE_VERSION = 4 (src/ai/navClient.js:32) is part of navCacheKey. Bump it whenever the bake output changes."
traps:
  - "The worker spelling must stay the literal new Worker(new URL('./navWorker.js', import.meta.url), { type: 'module' }) (src/ai/navClient.js:99). Any other spelling stops Vite from bundling it."
  - "If the worker dies, soups at or above DEGENERATE_MIN_TRIS = 1000 abort. They are never re-baked on the main thread."
  - "Player foot coordinates that miss walkable spans (while swimming or levitating) remain in the anchor union (`src/ai/navBake.js`) so the occupied room is never culled."
  - "The dungeon soup leaves out unlocked action doors (src/scenes/dungeonContext.js:7574). Locked and special doors stay walls."
dfu: []
tags:
  - "navmesh"
  - "recast"
  - "bake"
  - "indexeddb"
  - "worker"
---

# Collider-Soup Bake, Cell Lock, Anchors, and the Bake Cache

Collider-soup navmesh baking shares exact world-space triangles with physics while locking cell resolution for dungeon doorways and caching meshes off-thread.

- **World-Space Soup and Doorway Erosion:** `bakeNavFromCollider` in `src/ai/navBake.js` reads collider triangles directly in world space, excluding unlocked action doors (`src/scenes/dungeonContext.js:7574`) while keeping locked and special doors as solid walls. `FLAT_EPS = 1e-4` (`src/ai/triRaster.js:100`) assigns zero-thickness level floors a one-voxel span. Unlike open terrain (`coarsenAgent` in `src/ai/navmesh.js:87`), `bakeSoup` never coarsens and locks `cs = 0.25` m. `SOUP_AGENT = { ...AGENT, radius: AGENT.cs }` erodes one `0.25` m cell ring rather than the `0.4` m `AGENT` radius, keeping `1.25` m doorways passable.
- **3D Anchors and Hole Bridging:** `landAnchors` snaps anchor points to a walkable span within `ANCHOR_Y_TOLERANCE = 0.6` m across the target column or its eight neighbors, and `regionAnchor` forwards full 3D anchors to `buildRegions` (retaining swimming or levitating player foot coordinates in the anchor union so the active room is not culled). `mergeRegionHoles` bridges hole contours into outer contours so `buildPolyMesh` preserves pillars.
- **Worker Bundling and Cache Hydration:** `NavClient` (`src/ai/navClient.js`) keys IndexedDB entries with `NAV_BAKE_VERSION = 4` (`navCacheKey`, or `store: null` indoors), spawns `new Worker(new URL('./navWorker.js', import.meta.url), { type: 'module' })` (`src/ai/navWorker.js`), aborts soups at or above `DEGENERATE_MIN_TRIS = 1000` on worker failure, and hydrates results via `hydrateBakedNav` and `buildPackedIndex`.
