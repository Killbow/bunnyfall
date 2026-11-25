---
slug: landforms-save-frame-and-restand
title: "Landforms: DFU-Frame Records, Restanding, and Late Road Ground"
domain: world
kind: subcard
parent: landforms-terrain-shaper-overview
files:
  - src/world/landformLiftWorld.js
  - src/world/landforms.js
  - src/scenes/world.js
  - src/scenes/worldModes.js
  - src/world/overworldSpawns.js
  - src/saves/save.js
  - src/player/collider.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "03-World/Landforms.md"
related:
  - landforms-terrain-shaper-overview
  - relay-ground-gate-hello-and-refusal
  - shared-ground-agreement-overview
  - realm-saves-and-mod-save-hooks
invariants:
  - "Every exterior height a record carries (save, scene cache, ship deck, anchor, or outer dungeon camp) is written in the DFU frame: `groundFrameHeight(y, x, z) = y - landformLiftAt(x, z)` while landforms are on."
  - "On read, restandHeight(y, x, z, was) puts the current lift back on and corrects for terrain-scale stamps, so saves cross landform on/off and builds without a fall."
  - "landformLiftField runs the shaped-minus-classic sample field through blendLocationTerrain, exact in towns and in the wild."
traps:
  - "landformLiftAt for an unbuilt pixel must use the side-effect-free _liftLocationAt probe; reading the build path drifts camps during boot."
  - "The lift field cache key includes whether the road network has landed (terrainGen.roads()); a late network rebuilds cut pixels and rideGround calls groundMoved on loot, torches, camps, enemies and guards (world.js:5926-5927)."
  - "Any change to ground shaping must bump GROUND_LAW (src/net/wire.js) so the relay can refuse old-ground builds in ground rooms."
dfu: []
tags:
  - landforms
  - saves
  - restand
  - ground-frame
  - multiplayer
---

# Landforms: DFU-Frame Records, Restanding, and Late Road Ground

Persisted exterior coordinates store heights in the unlifted DFU frame so records survive landform toggles, scale changes, and late-arriving road networks (`src/world/landformLiftWorld.js`, `src/scenes/world.js`).

- **DFU-frame records and restanding (`src/world/landformLiftWorld.js`, `src/scenes/world.js`, `src/scenes/worldModes.js`, `src/saves/save.js`):** `createLandformLiftWorld(shared)` exposes `{buildingDoors,groundFrameHeight,groundFrameNative,restandHeight,scaleOf}` to `world.js`, while `worldModes.js` reads `host.restandSceneHeight` and `host.outerCampsSave`. Every exterior height in saves (`SAVE_VERSION=1`), scene caches, ship decks, anchors, and outer camps writes `groundFrameHeight(y,x,z)=y-landformLiftAt(x,z)`. On read, `restandHeight(y,x,z,was)` reapplies current lift and reconciles terrain-scale stamps (`scaleOf(stamp)` falls back to `DEFAULT_TERRAIN_SCALE`).
- **Lift field cache, late roads, and ground law (`src/world/landformLiftWorld.js`, `src/world/landforms.js`, `src/world/overworldSpawns.js`, `src/player/collider.js`, `src/net/wire.js`):** `landformLiftField` passes shaped-minus-classic samples through `blendLocationTerrain`, caching `LIFT_FIELDS_KEPT=32` fields and build rects with longest-unasked eviction. Unbuilt pixels query `_liftLocationAt` without build side effects so boot probes never drift camps. Because the cache key includes `Boolean(terrainGen.roads())`, a late road network rebuilds cut pixels and `rideGround` runs `groundMoved` across loot, torches, camps, enemies, and guards. Collider and motor bounds use `SLOPE_LIMIT_DEG=70` and `FALL_CARRY_MAX=1923.75` (`MAX_TERRAIN_HEIGHT*STREAMING_TERRAIN_SCALE`), while `GROUND_LAW=1` gates ground-room handshakes when `groundGate` is `'on'`.
