---
slug: revenant-lair-reach-and-single-body
title: "Revenant Lair Placement Reach and One Body per Revenant"
domain: ai
kind: subcard
parent: wallet-weight-glyphs-and-raid-lairs-overview
files:
  - src/scenes/dungeonContext.js
  - src/world/dungeonEnd.js
  - src/world/sdDungeon.js
  - src/ai/navmesh.js
  - src/revenants/revenant.js
  - src/characters/exteriorFoes.js
  - src/combat/harmMark.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19.md"
related:
  - wallet-weight-glyphs-and-raid-lairs-overview
  - revenant-lairs-thefts-and-companions
  - revenants-lifecycle-overview
  - enemy-ai-navmesh-and-combat-tactics
  - super-dungeon-look-rift-return-and-veil
invariants:
  - "LAIR-REACH: the local dungeonEnd() in dungeonContext.js picks from sdEndMarks candidates, which are interior-block enemy markers with dry ones preferred. Border-cap markers are used only when no interior markers exist."
  - "LAIR-WALK: standLairRevenant floods reachableFrom(enhancedNav.chf, enhancedNav.anchor). reachableEndOf then takes the farthest candidate the walk can reach. A point counts as reachable only within REACH_LEVEL_M (1) of a floor polygon."
  - "If no navmesh is available, placement falls back to the plain marker rule, dungeonEndOf."
  - "LAIR-HOME: when the lair stands a revenant, the older body is added to `_left`. revenantStale then reports that body as stale, and it does no deeds in the revenant's name."
  - "goesHome returns false while harmFightSince is non-null, while the feud ledger is open, while the body is already in the lair pool, or while the last deed is 'yielded'."
  - "revenantPresence ignores stale bodies. The exterior cull removes them with withdrawStale, and the dungeon cull removes them with questPoolOps.removeFoe, taking the band with them."
traps:
  - "Placement must not depend only on the navmesh bake. Placement waits at most LAIR_WALK_WAIT_MS (20000 ms), then falls back to the marker rule."
  - "If no stand position is found or the spawn fails, releaseRevenantStand(r) must run."
dfu: []
tags:
  - revenant
  - lair
  - navmesh
  - dungeon
---

# Revenant Lair Placement Reach and One Body per Revenant

Dungeon lair placement picks a walkable interior end marker for a standing revenant while retiring any older body still in the world.

## Reachable End Markers and Navmesh Fallback

- **Interior candidates (`src/scenes/dungeonContext.js`, `src/world/sdDungeon.js`):** Local `dungeonEnd()` selects from `sdEndMarks` candidates, preferring dry interior-block enemy markers and using border-cap markers only when no interior markers exist.
- **Navmesh flood and fallback (`src/world/dungeonEnd.js`, `src/ai/navmesh.js`):** `standLairRevenant` floods `reachableFrom(enhancedNav.chf, enhancedNav.anchor)`, and `reachableEndOf` chooses the farthest candidate within `REACH_LEVEL_M` (`1`) of a floor polygon. Placement waits up to `LAIR_WALK_WAIT_MS` (`20000` ms) for the navmesh before falling back to `dungeonEndOf`. The chosen spawn point `spotAbout(far, 4)` is kept only if the reach test accepts it; otherwise the marker itself is used. If no stand position exists or spawning fails, `releaseRevenantStand(r)` releases the stand claim.

## Single Active Body and Stale Culling

- **Retiring older bodies (`src/revenants/revenant.js`, `src/combat/harmMark.js`):** A pending stand claim goes home only after `REVENANT_STAND_GRACE_MS` (`15000` ms), and `goesHome` returns `false` while `harmFightSince` is non-null, the feud ledger is open, the body is already in the lair pool, or the last deed is `'yielded'`. When the lair stands a revenant, any older body is added to `_left` so `revenantStale` marks it stale and blocks further deeds.
- **World culls (`src/characters/exteriorFoes.js`, `src/scenes/dungeonContext.js`):** `revenantPresence` ignores stale bodies, exterior sweeps remove them and their bands via `withdrawStale`, and dungeon sweeps remove them via `questPoolOps.removeFoe`.
