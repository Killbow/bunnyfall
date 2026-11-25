---
slug: indoor-watch-interior-navmesh-and-no-route
title: "Indoor Watch: On-Demand Interior Navmesh, Off-Mesh Goals, and the No-Route Stand"
domain: ai
kind: subcard
parent: theft-law-indoor-watch-and-door-tokens-overview
files:
  - src/ai/interiorNav.js
  - src/ai/navClient.js
  - src/ai/enhancedMotor.js
  - src/characters/enemyMotor.js
  - src/characters/cityGuards.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-16b.md"
related:
  - theft-law-indoor-watch-and-door-tokens-overview
  - enemy-ai-navmesh-and-combat-tactics
  - doorway-clearance-and-enemy-spacing
  - living-world-indoors-and-lodgers
invariants:
  - "`createInteriorNav` bakes through `NavClient({ store: null })`: it bakes on demand, the first frame a motor in the room reads the mesh, and never caches to IndexedDB."
  - "Unlocked action doors are left out of the collider soup (`doorsOutOfSoup`); a locked door stays a wall, and a lock change re-bakes."
  - "Bake anchors are player arrival, room doorways, guard stand spots, and (on demand) player feet (`feetAnchors`, at most `MAX_FEET_BAKES` 4)."
  - "An off-mesh goal resolves through `meshPointNear` within `GOAL_REACH` (4 m) and is walked in via `_routeOffMesh`."
  - "A watchman hunting the player (`huntsThePlayer`) from another island for `CUT_OFF_S` (2 s) is stood on the player's island at `noRouteSpot`, never on the player, in another watchman, or in a model."
  - "Only the watch is stood; the building's own enemies route on the mesh but are never teleported."
traps:
  - "The classic lane (Enhanced AI switch off) bakes nothing and stands nobody; keep DFU behavior there."
  - "Snap the enemy's facing to the target before the swing; facing a route corner fails the 22.5 degree `STOP_YAW_GATE_DEG` check."
dfu:
  - Assets/Scripts/Game/EnemyMotor.cs
  - Assets/Scripts/Game/Entities/PlayerEntity.cs
tags:
  - navmesh
  - city-guards
  - interior
  - enhanced-ai
  - pathfinding
---

# Indoor Watch: On-Demand Interior Navmesh, Off-Mesh Goals, and the No-Route Stand

When Enhanced AI is active, indoor rooms bake an on-demand navmesh so city guards and resident enemies navigate partitions and doorways without getting stuck as in DFU. When Enhanced AI is off, the classic lane preserves unmodified DFU motor behavior.

- **On-demand uncached baking:** `createInteriorNav` (`src/ai/interiorNav.js`) bakes via `NavClient({ store: null })` (`src/ai/navClient.js`) on the first frame an indoor motor queries the mesh (`src/scenes/worldModes.js`). Because a worker bake takes 0.2 to 0.7 seconds, meshes never cache in IndexedDB. Requests coalesce one at a time without dropping updates.
- **Doors and anchors:** Unlocked action doors are excluded from the collider soup (`doorsOutOfSoup`), whereas locked doors act as walls and trigger a re-bake when lock state changes. Bake anchors combine player arrival, room doorways, guard stand spots, and on-demand foot positions (`feetAnchors`, capped at `MAX_FEET_BAKES`, 4).
- **Off-mesh goals and facing:** In `src/ai/enhancedMotor.js` and `src/characters/enemyMotor.js`, an off-mesh target snaps to the nearest polygon point via `meshPointNear` within `GOAL_REACH` (4 meters) and walks in via `_routeOffMesh`. Before swinging, the motor snaps enemy yaw toward the target to pass the 22.5 deg `STOP_YAW_GATE_DEG` check.
- **Watchman no-route stand:** If a city guard (`src/characters/cityGuards.js`) with `huntsThePlayer` stays on a disconnected island for `CUT_OFF_S` (2 seconds), the motor places the guard on the player island at `noRouteSpot`, avoiding the player, other guards, and geometry. Resident enemies route on the mesh without teleporting.
