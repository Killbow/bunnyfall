---
slug: elite-breach-ascent-route-graph-and-storeys
title: "Ascent Route Graph, Roads, Stacked Storeys, and Cross-Storey Hits"
domain: world
kind: subcard
parent: elite-breach-ascent-overview
files:
  - src/net/eliteGates/egAscent.js
  - src/net/eliteGates/egWalkGraph.js
  - src/net/eliteGates/egRouteProof.js
  - src/net/eliteGates/egBodies.js
  - src/net/eliteGates/egFair.js
  - src/net/eliteGates/egLaw.js
  - src/net/bossRef.js
  - src/systems/eliteGates/egClient.js
  - src/characters/madeLevel.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Ascent.md"
related:
  - elite-breach-ascent-overview
  - elite-breach-broken-way-and-trial-await
  - elite-breach-hall-generator-and-span-solver
  - elite-breach-spire-client-rules-and-telegraphs
invariants:
  - "Route links have kind walk, stair, climb, drop, span, or bridge and road 0 (main), 1 (fork), or 2 (side). The egAscent.js route check rejects anything else, and the main way must follow road-0 links."
  - "Stacked floors are separated by at least `EG_STACK_M` (4 m, egWalkGraph.js, from `EG_HEIGHT_LAW` 9)."
  - "Melee (`egHitBody`, egBodies.js) reaches only its own storey; shafts and spells cross storeys unless `egStacked`/`egFloorBetween` find a slab between the two bodies."
  - "Fight-floor tests (`egOnFight`, `egFightPieceAt`, `egKeepOnFight`, `egFloorTest`, `egInHall`) take an optional height `y` so stacked floors resolve correctly."
traps:
  - "Banner shaft fix (FB1018D): shafts and spells used to be refused by storey alone; now only a floor between the two bodies blocks them."
  - "Climb proof is grip-time based (`EG_GRIP_S`, `EG_CLIMB_MPS`, `EG_CLIMB_LEDGE_MIN_M` 0.8 m in egRouteProof.js), not a fixed meter band."
  - "Spire traversal ground is reported by `egClient.onTraverse()` for made-level rules, not by the fight floor."
dfu: []
tags:
  - elite-gates
  - route-graph
  - storeys
  - climbing
  - combat
---

# Ascent Route Graph, Roads, Stacked Storeys, and Cross-Storey Hits

Ascent halls organize 3D navigation, vertical separation, and combat line-of-fire around a verified walk graph.

- **Route Graph and Roads:** In `src/net/eliteGates/egAscent.js`, every route link carries a `kind` (`walk`, `stair`, `climb`, `drop`, `span`, or `bridge`) and a `road` (`0` for main, `1` for fork, or `2` for side). The route validator rejects any other kind or road, requires the primary path to follow road-`0` links, and uses `egRouteSpanSteps` (`src/net/eliteGates/egRouteProof.js`) to list the pieces crossed by a span link.
- **Climbing and Hang Depths:** Climb validation in `src/net/eliteGates/egRouteProof.js` solves grip endurance using `EG_GRIP_S`, `EG_CLIMB_MPS`, and `EG_CLIMB_LEDGE_MIN_M` (`0.8` m) rather than a fixed vertical meter band. Climb proximity checks use `EG_CLIMB_NEAR_M` (`3` in `src/net/eliteGates/egFair.js`) and `EG_ROUTE_CLIMB_NEAR_M` (`3`), while `EG_ASCENT_HANG_CM` sets under-slab hang depths per piece (`step: 2200`, `disc: 600`, `band: 300`).
- **Stacked Storeys and Air Volumes:** Starting at `EG_HEIGHT_LAW` (`9` in `src/net/eliteGates/egLaw.js`), `src/net/eliteGates/egWalkGraph.js` enforces at least `EG_STACK_M` (`4` m) between stacked floors and computes open-air volumes via `egAirOf` (`EG_AIR_BODY_M = 2`). Floor queries (`egOnFight`, `egFightPieceAt`, `egKeepOnFight`, `egFloorTest`, and `egInHall`) accept an optional `y` coordinate to disambiguate overlapping storeys, while `egClient.onTraverse()` (`src/systems/eliteGates/egClient.js`) reports traversal ground for `src/characters/madeLevel.js` and `src/net/bossRef.js`.
- **Cross-Storey Combat:** In `src/net/eliteGates/egBodies.js`, melee hits (`egHitBody`) only strike targets on the attacker's storey, whereas ranged shafts and spells cross storeys freely unless `egStacked` and `egFloorBetween` detect an intervening floor slab.
