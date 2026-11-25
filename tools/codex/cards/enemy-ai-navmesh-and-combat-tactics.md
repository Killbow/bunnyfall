---
slug: enemy-ai-navmesh-and-combat-tactics
title: Enemy AI, Navmesh, and Combat Tactics
domain: ai
kind: overview
files:
  - src/characters/enemyMotor.js
  - src/ai/enhancedMotor.js
  - src/ai/navmesh.js
  - src/ai/navClient.js
  - src/ai/tactics.js
  - src/combat/combatVisuals.js
  - src/items/foeLootCap.js
invariants:
  - "EnhancedEnemyAI subclasses src/characters/enemyMotor.js via _getDestination, projecting intermediate waypoints past stopDistance and preserving classic vertical aim for flyers."
  - "src/ai/tactics.js caps active attackers per target at two melee and two ranged tokens while managing ring spacing, kiting cooldowns, and stagger windows."
  - "summonedBody and capFoeLoot in src/items/foeLootCap.js mark artifact summons with entity.summoned = true so they drop no loot."
traps:
  - "Vite only bundles the navmesh worker when instantiated literally as new Worker(new URL('./navWorker.js', import.meta.url), { type: 'module' }); worker failures on large meshes skip main-thread bakes."
  - "src/combat/combatVisuals.js changes Enhanced UI rendering only; sight detection remains governed by blockedByIllusionEffect in src/characters/enemyMotor.js."
dfu:
  - Assets/Scripts/Game/EnemyMotor.cs
  - Assets/Scripts/Game/EnemySenses.cs
  - Assets/Scripts/Game/Entities/EntityConcealmentBehaviour.cs
tags:
  - ai
  - navmesh
  - tactics
  - concealment
  - summons
---

# Enemy AI, Navmesh, and Combat Tactics

Enemy movement layers off-thread navmesh routing and combat tactics onto `EnemyMotor` and `EnemySenses`.

- **Motor and navmesh worker:** `src/ai/enhancedMotor.js` subclasses `src/characters/enemyMotor.js` via `_getDestination`, projecting intermediate waypoints past `stopDistance` to prevent corner stalls, moving feet via `collider.move`, and preserving classic vertical aim for flyers. `src/ai/navClient.js` spawns `new Worker(new URL('./navWorker.js', import.meta.url), { type: 'module' })` for Vite, skips main-thread bakes on large meshes (`>= DEGENERATE_MIN_TRIS`) on worker failure, and pairs with `maxArea` polygon caps (`src/ai/navmesh.js`).
- **Combat tactics:** Under `enhancedAI`, `src/ai/tactics.js` (`TACT`) caps attackers to `2` melee and `2` ranged tokens per target, managing ring spacing, kiting cooldowns, and poise/stagger windows.
- **Concealment targeting vs. visuals:** `blockedByIllusionEffect` (`src/characters/enemyMotor.js`) preserves DFU sight rules (invisibility blocks sight; chameleon and shadow roll `8%` and `4%` per classic update). `src/combat/combatVisuals.js` (`foeDraw`) changes Enhanced UI visuals only, drawing chameleon shimmer, shadow silhouettes, and hit flashes (`REVEAL_SECONDS`).
- **Zero-loot summoned allies:** `summonedBody` and `capFoeLoot` (`src/items/foeLootCap.js`) stamp `entity.summoned = true` (synced via `sm` online and saved) on artifact summons such as Sanguine Rose, clearing all loot.
