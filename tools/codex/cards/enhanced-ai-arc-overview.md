---
slug: "enhanced-ai-arc-overview"
title: "Enhanced AI Arc: Navmesh Routing Over the Classic Motor"
domain: "ai"
kind: "overview"
parent: null
files:
  - "src/ai/enhancedMotor.js"
  - "src/characters/enemyMotor.js"
  - "src/ai/navmesh.js"
  - "src/ai/navBake.js"
  - "src/ai/navClient.js"
  - "src/ai/navWorker.js"
  - "src/ai/triRaster.js"
  - "src/ui/uiPrefs.js"
  - "src/mods/features.js"
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Enhanced-AI-Arc.md"
related:
  - "enhanced-ai-collider-soup-bake-and-anchors"
  - "enhanced-ai-routed-motor-and-flyer-aim"
  - "enemy-ai-navmesh-and-combat-tactics"
  - "indoor-watch-interior-navmesh-and-no-route"
  - "tactics-arc-enhanced-enemy-ai-overview"
invariants:
  - "src/characters/enemyMotor.js (EnemyAI) stays the classic DFU EnemyMotor port. Enhanced AI lives only in EnhancedEnemyAI extends EnemyAI (src/ai/enhancedMotor.js:151), which overrides _getDestination."
  - "The enhancedAI pref is ON by default (src/mods/features.js:506, initial: true, online: true) and is forced on online. Shelves saved before the change adopt it through PREF1_ADOPT_NEW_DEFAULT (src/ui/uiPrefs.js:22)."
  - "A motor runs EnhancedEnemyAI only when its host hands it a nav mesh and enhancedAI is on. With either missing it runs classic EnemyAI."
traps:
  - "Do not edit enemyMotor.js to add routing. Put shared logic behind a hook like _aimY that the subclass calls."
dfu:
  - "Assets/Scripts/Game/EnemyMotor.cs"
tags:
  - "enhanced-ai"
  - "navmesh"
  - "enemy-motor"
  - "recast"
---

# Enhanced AI Arc: Navmesh Routing Over the Classic Motor

Enhanced AI layers asynchronous navmesh baking and synchronous polygon pathfinding onto the classic DFU `EnemyMotor` port without altering base movement rules.

- **Subclass Separation and Preference Gates:** `EnemyAI` in `src/characters/enemyMotor.js` remains a clean port of `EnemyMotor.cs`, exposing shared hooks such as `_aimY` rather than embedding routing logic. All pathfinding overrides live in `EnhancedEnemyAI extends EnemyAI` (`src/ai/enhancedMotor.js:151`), which overrides `_getDestination`. The `enhancedAI` preference defaults to `true` (`src/mods/features.js:506`, `initial: true`, `online: true`), is forced on in online sessions, and migrates older saved profiles via `PREF1_ADOPT_NEW_DEFAULT` in `src/ui/uiPrefs.js:22`. An enemy instance runs `EnhancedEnemyAI` only when `enhancedAI` is active and the scene host supplies a navmesh; if either is missing, it falls back to classic `EnemyAI`.
- **Recast Pipeline and Path Budget:** `src/ai/triRaster.js` voxelizes collider triangles, `src/ai/navmesh.js` builds regions, merges holes, and constructs the polygon mesh, and `src/ai/navClient.js` coordinates caching and off-thread execution on `src/ai/navWorker.js` (`src/ai/navBake.js`). Once hydrated on the main thread, `findPath` executes synchronously against the compact heightfield under a shared per-frame cap of `PATH_BUDGET_PER_FRAME = 3` (`src/ai/enhancedMotor.js:121`). Moving platforms and action-driven geometry remain out of scope.
