---
slug: billboard-cover-proxies-and-sight-rays
title: "Billboard Cover Proxies and Sight Rays"
domain: ai
kind: subcard
parent: tactics-arc-enhanced-enemy-ai-overview
files:
  - src/ai/cover.js
  - src/player/collider.js
  - src/characters/enemyMotor.js
  - src/combat/arrowFlight.js
  - src/magic/hostMagic.js
  - src/scenes/exterior.js
  - src/scenes/dungeonContext.js
  - src/scenes/interiorContext.js
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Tactics-Arc.md"
related:
  - tactics-arc-enhanced-enemy-ai-overview
  - enemy-ai-navmesh-and-combat-tactics
  - attack-tokens-engage-rings-and-enemy-retreat
invariants:
  - "A solid billboard qualifies as cover (`isCoverFlat`) only when drawn height >= `COVER_MIN_H` (1.2 m) and width >= `COVER_MIN_W` (0.5 m), and only if its archive is not in `NOT_COVER_ARCHIVES` {199, 201, 210, 216}."
  - "`coverProxy` builds an upright cylinder at the base: radius `COVER_RADIUS_FRAC` 0.35 x width, height `COVER_HEIGHT_FRAC` 0.9 x height. Trees split into a trunk (r <= `COVER_TRUNK_R` 0.3) and a crown from 0.45 of height."
  - "Cover blocks sight (`canSeeTarget` via `coverDistance(..., sight=true)`) and missiles (arrows in arrowFlight.js, spell bolts in hostMagic.js via `coverStep`). It never blocks hearing (`canHearTarget`)."
  - "A ray that starts inside a proxy is not blocked by it, and a sight ray that ends inside one is not blocked either, so cover works both ways."
  - "The cover index (`createCoverIndex`, grid `COVER_CELL` 4) lives beside the collider sets, never inside the collision mesh, so navmesh, ground probes and walking are untouched."
traps:
  - "Felled trees are removed from cover through the `FELLED` WeakSet. Do not rebuild the index to drop one."
  - "People (`c.noCover`) are never cover."
dfu:
  - Assets/Scripts/Game/EnemySenses.cs
tags:
  - ai
  - cover
  - billboards
  - line-of-sight
  - missiles
  - tact1
---

# Billboard Cover Proxies and Sight Rays

Billboard cover gives solid flats cylindrical occlusion proxies for enemy sight and projectile flights without altering player or navmesh collision geometry.

- **Qualifying Billboards and Cylinder Proxies:** In `src/ai/cover.js`, `isCoverFlat` accepts a solid billboard only when its drawn height is at least `COVER_MIN_H` (`1.2` m), its width is at least `COVER_MIN_W` (`0.5` m), `c.noCover` is unset (excluding NPCs and people), and its texture archive is outside `NOT_COVER_ARCHIVES` (`199`, `201`, `210`, and `216`). `coverProxy` constructs an upright base cylinder with radius `COVER_RADIUS_FRAC` (`0.35 * width`) and height `COVER_HEIGHT_FRAC` (`0.9 * height`), whereas trees (`coverProxies` with `{ tree: true }`) split into a narrow trunk (`r <= COVER_TRUNK_R` of `0.3`) and an upper crown starting at `0.45` of total height.
- **Spatial Index and Felled Trees:** Scene builders (`src/scenes/exterior.js`, `src/scenes/dungeonContext.js`, and `src/scenes/interiorContext.js`) attach `createCoverIndex({ enabled = coverSwitchOn })` alongside `src/player/collider.js` using grid size `COVER_CELL` (`4`), bounded by `COVER_WIDE` (`32`) and `CELL_EXACT` (`16`). Because the index stays out of the triangle collider, walking, ground probes, and navmesh bakes ignore it, and chopped trees drop out via the `FELLED` WeakSet without rebuilding the grid.
- **Sight and Missile Raycasts:** `rayCylinder` and `coverDistance(collider, origin, dir, maxDist, sight)` test rays against indexed proxies. Cover blocks sight (`canSeeTarget` in `src/characters/enemyMotor.js` with `sight = true`) and intercepts arrows (`src/combat/arrowFlight.js`) and spell bolts (`coverStep` in `src/magic/hostMagic.js`), while leaving hearing (`canHearTarget`) untouched. Rays starting inside a proxy, or sight rays ending inside one, pass through unblocked.
