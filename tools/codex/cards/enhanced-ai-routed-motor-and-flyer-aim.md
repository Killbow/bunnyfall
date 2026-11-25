---
slug: "enhanced-ai-routed-motor-and-flyer-aim"
title: "Routed Motor: Waypoints, Stuck Nudges, and Classic Vertical Aim"
domain: "ai"
kind: "subcard"
parent: "enhanced-ai-arc-overview"
files:
  - "src/ai/enhancedMotor.js"
  - "src/characters/enemyMotor.js"
  - "src/scenes/dungeonContext.js"
  - "src/characters/exteriorFoes.js"
  - "src/characters/cityGuards.js"
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Enhanced-AI-Arc.md"
related:
  - "enhanced-ai-arc-overview"
  - "enhanced-ai-collider-soup-bake-and-anchors"
  - "indoor-watch-interior-navmesh-and-no-route"
  - "enemy-ai-navmesh-and-combat-tactics"
invariants:
  - "A waypoint counts as reached within WP_REACH = 0.45 m. Intermediate corners are projected out to stopDistance + PROJECT_MARGIN (0.05) so the enemy does not stop at a corner."
  - "Waypoints set x and z only. The enemy keeps its own y, so flyers do not stall on waypoint height."
  - "The routed final leg aims y through EnemyAI._aimY(predictedFeetY) (src/characters/enemyMotor.js:1366), the same height classic destination targeting uses (AUDIT 62 F1)."
  - "_stuckWatch runs _fallCheck along its heading before nudging, and moves feet only through collider.move."
traps:
  - "`buildFoeAt` (`src/scenes/dungeonContext.js`) reads `enhancedNav.world` during enemy construction; `enhancedNav` must be declared before the first `buildFoeAt` call to avoid a temporal dead zone."
dfu:
  - "Assets/Scripts/Game/EnemyMotor.cs"
tags:
  - "enemy-motor"
  - "pathfinding"
  - "flyers"
  - "enhanced-ai"
---

# Routed Motor: Waypoints, Stuck Nudges, and Classic Vertical Aim

`EnhancedEnemyAI` in `src/ai/enhancedMotor.js` steers enemies along horizontal navmesh waypoints, preserves classic vertical targeting for flyers, and recovers from corner stalls through collider-checked nudges.

- **Waypoint Projection and Vertical Aim:** A routed waypoint registers as reached within `WP_REACH = 0.45` m. To keep the base motor from braking early at turn corners, intermediate corners project outward to `stopDistance + PROJECT_MARGIN` (`0.05`). Waypoints assign horizontal `x` and `z` coordinates only while preserving the current enemy `y` elevation so flying creatures never stall on floor height. On the final routed leg toward the target, vertical aim delegates to `EnemyAI._aimY(predictedFeetY)` in `src/characters/enemyMotor.js:1366`, matching classic `EnemyMotor.cs` destination targeting.
- **Stuck Recovery and Host Wiring:** When forward progress stalls, `_stuckWatch` and `_repathToward` verify footing by calling `_fallCheck` along the intended heading before applying a nudge and displace the enemy strictly through `collider.move`. Scene hosts wire `nav`, `navWorld`, and `navGoal` into enemy constructors (`src/characters/exteriorFoes.js`, `src/characters/cityGuards.js`, and `src/scenes/dungeonContext.js`, where `enhancedNav` must be initialized before `buildFoeAt` reads `enhancedNav.world`, and dungeon sites omit `navGoal`). Street pools in `src/scenes/worldModes.js` pass no `nav`, leaving outdoor street enemies and city guards on classic `EnemyAI`.
