---
slug: tactics-arc-enhanced-enemy-ai-overview
title: "Tactics Arc: Enhanced Enemy AI Overview"
domain: ai
kind: overview
parent: null
files:
  - src/ai/tactics.js
  - src/ai/enhancedMotor.js
  - src/ai/cover.js
  - src/ai/tacticsClock.js
  - src/characters/foeSpacing.js
  - src/characters/enemyMotor.js
  - src/ai/foeBlows.js
  - src/ai/blowShapes.js
  - src/render/foeTelegraph.js
routes: []
tables: []
replacesBible:
  - "12-Enhanced-AI/Tactics-Arc.md"
related:
  - enemy-ai-navmesh-and-combat-tactics
  - billboard-cover-proxies-and-sight-rays
  - attack-tokens-engage-rings-and-enemy-retreat
  - doorway-clearance-and-enemy-spacing
  - enemy-telegraphs-poise-and-punish
invariants:
  - "With the `enhancedAI` pref off (`tacticsSwitchOn`, `coverSwitchOn`), enemies run the classic DFU tick (`_classicTick`) unchanged: no cover index, no tokens, no telegraphs."
  - "Doorway clearance (`clearDoorways`) and cross-pool spacing (`spaceAcross`/`spaceFoes`) run on both lanes, classic and enhanced."
  - "Tactics timers read the enemies' own simulation clock (`tacticsNow` from src/ai/tacticsClock.js), never wall-clock time, so frame hitches and pauses do not skip states."
traps:
  - "Do not gate `clearDoorways` or `spaceAcross` behind the Enhanced AI switch; anti-griefing has to hold on the classic lane too."
  - "Do not read `Date.now()`/`performance.now()` inside tactics; use `tacticsNow`."
dfu:
  - Assets/Scripts/Game/EnemyMotor.cs
  - Assets/Scripts/Game/EnemySenses.cs
tags:
  - ai
  - tactics
  - enhanced-ai
  - cover
  - doorways
  - telegraphs
---

# Tactics Arc: Enhanced Enemy AI Overview

The Tactics Arc layers billboard cover, token-paced engage rings, doorway anti-griefing, and telegraphed heavy blows onto `src/characters/enemyMotor.js` and `src/ai/enhancedMotor.js`.

- **Switch Discipline and Simulation Clock:** When the `enhancedAI` preference is off (`tacticsSwitchOn` in `src/ai/tactics.js` and `coverSwitchOn` in `src/ai/cover.js`), enemies execute the classic DFU `_classicTick` without cover proxies, attack tokens, or heavy blow telegraphs. By contrast, doorway clearance (`clearDoorways`) and body spacing (`spaceFoes` and `spaceAcross` in `src/characters/foeSpacing.js`) always run on both the classic and enhanced lanes. All tactics timers read `tacticsNow` (`src/ai/tacticsClock.js`) rather than wall-clock time so pauses and frame hitches never expire leases early.
- **Tactics Constants and Telegraphs:** Tactic tuning lives on the frozen `TACT` table in `src/ai/tactics.js`. Heavy blow telegraphs (`src/ai/foeBlows.js`, `src/ai/blowShapes.js`, and `src/render/foeTelegraph.js`) unlock at `BLOW_TIER_LEVEL = 10` or elite rank, rolling `BLOW_CHANCE = 1/10` per classic tick while holding a melee token in reach and allowing one wind-up within `BLOW_NEAR = 20` m. Base `BLOW` shapes cover `lunge` (`0.7` s, `4.5` m lane, `halfW: 0.6`, `x1.5`), `sweep` (`0.8` s, `r: 3.2`, `+/-65` deg, `x1.25`), and `slam` (`0.9` s, `r: 2.0`, `1.0` m ahead, `x1.75`) for beasts, brutes, and blades (excluding `BLOW_CASTERS` `128`, `131`, and `132`, spectral, small, and flying enemies), drawn by `drawFoeTelegraphs` and judged by `blowConnects`, `inBlow`, and `registerBlowDodgedListener`.
- **Subcards:** `billboard-cover-proxies-and-sight-rays` covers cylinder proxies and ray occlusion; `attack-tokens-engage-rings-and-enemy-retreat` covers token leases, rings, kiting, and retreat; `doorway-clearance-and-enemy-spacing` covers sill pushes, guard insets, and click pass-through.
