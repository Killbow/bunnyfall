---
slug: npc-lanes-frame-budget-and-build-gate
title: "NPC Lanes, Global Frame Budget, Build Gate, and Standing Horses"
domain: characters
kind: subcard
parent: morrowind-npc-bodies-overview
files:
  - src/characters/npcBodies.js
  - src/net/peerBodies.js
  - src/world/standingHorses.js
  - src/world/horseRig.js
  - src/characters/cityGuards.js
  - src/scenes/world.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Morrowind-NPCs.md"
related:
  - morrowind-npc-bodies-overview
  - mw-gpu-skinning-and-sprite-batch
  - living-world-census-schedules-and-watch
invariants:
  - "`NPC_BODY_TIERS`: `near` max `12`, range `30` m, `skinBudget` `4`, `spareMax` `4`; `all` max `24`, range `60` m, `skinBudget` `8`, `spareMax` `8`."
  - "`WATCH_BODY_TIERS`: `near` `4` bodies, `30` m, `2` skins, `2` spares; `all` `8` bodies, `60` m, `4` skins, `4` spares."
  - "`NPC_FRAME_TIERS` caps every NPC lane combined: `near` `24` bodies and `8` skins; `all` `48` bodies and `16` skins."
  - "`NPC_FRAME_BUDGET` ranks by planar ground distance (`dx*dx + dz*dz`), not 3D camera distance."
  - "A held body keeps its place under `NPC_BUDGET_HYSTERESIS = 1.15`; stale lane reports expire after `NPC_BUDGET_ROUNDS = 1` report rounds, not milliseconds."
  - "Bodies outside active range never enter the build queue."
  - "`STANDING_HORSES_MAX = 8` within `STANDING_HORSE_RANGE = 60`, held to `STANDING_HORSE_HOLD = 1.15`."
traps:
  - "Using millisecond staleness for lane reports lets every lane cut alone after a hitch and over-queue builds."
  - "`BODY_BUILD_GATE` is shared with peer bodies; a stuck NPC build is released after `BODY_GATE_STALL_MS = 20000`."
dfu: []
tags:
  - frame-budget
  - performance
  - lanes
  - horses
  - city-watch
---

# NPC Lanes, Global Frame Budget, Build Gate, and Standing Horses

Population lanes enforce per-lane and global caps, distance hysteresis, and asynchronous build gating so busy scenes stay within frame budgets (`src/characters/npcBodies.js`, `src/net/peerBodies.js`, and `src/world/standingHorses.js`).

- **Lane and global tiers (`npcBodies.js`, `cityGuards.js`):** `createNpcBodies` and `createPopulationLane` default to `NPC_BODIES_DEFAULT` (`'near'`). Standard populations use `NPC_BODY_TIERS` (`near`: `12` bodies within `30` meters, `4` skin updates, and `4` cached spares; `all`: `24` bodies within `60` meters, `8` skin updates, and `8` spares). City guards in `src/characters/cityGuards.js` use `WATCH_BODY_TIERS` (`near`: `4` bodies, `30` meters, `2` skins, and `2` spares; `all`: `8` bodies, `60` meters, `4` skins, and `4` spares). Across all lanes combined, `NPC_FRAME_TIERS` caps total active NPCs at `24` bodies and `8` skins on `near`, or `48` bodies and `16` skins on `all`.
- **Planar ranking, hysteresis, and build gate (`npcBodies.js`, `peerBodies.js`):** `NPC_FRAME_BUDGET` ranks candidates by planar ground distance (`dx*dx + dz*dz`) and retains already-active bodies under `NPC_BUDGET_HYSTERESIS` (`1.15`). Lane reports expire after `NPC_BUDGET_ROUNDS` (`1` round) rather than wall-clock milliseconds so frame hitches never split the global cut. Out-of-range actors never queue builds. Ready actors assemble options via `peerBuildOpts` and pass through `BODY_BUILD_GATE`, which releases stalled builds after `BODY_GATE_STALL_MS` (`20000` ms).
- **Standing horses (`standingHorses.js`, `horseRig.js`):** Hitched horses render up to `STANDING_HORSES_MAX` (`8`) rigs within `STANDING_HORSE_RANGE` (`60` meters) with `STANDING_HORSE_HOLD` (`1.15`) hysteresis.
