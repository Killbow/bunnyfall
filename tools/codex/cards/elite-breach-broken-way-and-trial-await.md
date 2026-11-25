---
slug: elite-breach-broken-way-and-trial-await
title: "Law 10 Broken Bridges, Drops, Voids, and Trial Clock Holds"
domain: world
kind: subcard
parent: elite-breach-ascent-overview
files:
  - src/net/eliteGates/egAscent.js
  - src/net/eliteGates/egSpanLaw.js
  - src/net/eliteGates/egFragLaw.js
  - src/net/eliteGates/egFair.js
  - src/net/eliteGates/egBrain.js
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egWalkGraph.js
  - src/world/eliteGates/egKit.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Ascent.md"
related:
  - elite-breach-ascent-overview
  - elite-breach-ascent-route-graph-and-storeys
  - elite-breach-hall-generator-and-span-solver
  - elite-breach-clock-and-hall-rhythm
invariants:
  - "Bridges of at least `EG_BROKEN_MIN_CM` (1000) break and keep `EG_BROKEN_FOOT_CM` (150) at each end. A break has `EG_BROKEN_PIECES` [1,3] pieces, plus one per `EG_BROKEN_PER_CM` (700) past `EG_BROKEN_LONG_CM` (1200), up to `EG_BROKEN_MOST` (6)."
  - "Pieces come from `EG_BROKEN_KINDS` by band; bridges turned off +z use only `EG_BROKEN_TURNED` (still, crumble, beat, vent). Drift, Rail, and Pendulum always run along +z."
  - "Law 10 drops fall between `EG_DROP_LAW10_CM` (300) and `EG_DROP_CM` (450). The void triggers at `EG_VOID_DROP_M` (`EG_DROP_CM`/100 + 0.25), including under the arrival plate."
  - "`egTrialAwaits` holds `EG_AWAIT_CLOCKS` (waveAt, packAt, wanderAt, escortAt, ashAt, sparkAt, ventAt, quietUntil) for yard, athenaeum, deepway, and scriptorium until `egOnTrialGround`. The Deserter closes no rift while `F.await` is set."
traps:
  - "`EG_BROKEN_SLIDES` [0.5,0.25,0.75,0,1] and `EG_BROKEN_CLEAR_CM` (40, including sway) are module-private in egAscent.js."
  - "A lone piece is never a still slab, and Gust, Drop, and Riser are never used on approach courses (APPROACH_NOT)."
  - "Pendulum flights are checked at `EG_SOLVE_FLIGHT_N` (24) instants from `EG_SOLVE_FLIGHT_LAW` (10)."
dfu: []
tags:
  - elite-gates
  - broken-way
  - platforming
  - solver
  - trial-clock
---

# Law 10 Broken Bridges, Drops, Voids, and Trial Clock Holds

Law 10 (`EG_BROKEN_LAW`) replaces solid approach bridges with solver-checked platforming courses, deepens drops, and holds trial clocks until players reach the trial floor.

- **Broken Bridges:** In `src/net/eliteGates/egAscent.js` and `src/net/eliteGates/egLaw.js`, approach runs split into bridges of `EG_BROKEN_CHUNK_CM` (`1800`) to `EG_BROKEN_SPLIT_CM` (`2500`), with fork courses up to `EG_FORK_COURSE_CM` (`12500`) and retries `EG_BROKEN_TRIES` (`8`) and `EG_BROKEN_RUN` (`5`). Bridges of at least `EG_BROKEN_MIN_CM` (`1000`) break while keeping `EG_BROKEN_FOOT_CM` (`150`) end footings, inserting `EG_BROKEN_PIECES` (`[1, 3]`) plus one per `EG_BROKEN_PER_CM` (`700`) past `EG_BROKEN_LONG_CM` (`1200`), up to `EG_BROKEN_MOST` (`6`).
- **Piece Kinds and Solver:** Pieces draw from `EG_BROKEN_KINDS` (`EG_FRAG_BROKEN_LAW = 10` in `src/net/eliteGates/egFragLaw.js`). Bridges turned off `+z` use `EG_BROKEN_TURNED` (`still`, `crumble`, `beat`, and `vent`) so Drift, Rail (`EG_RAIL_CLEAR = 0.3`), and Pendulum run along `+z`. Lone pieces avoid still slabs, approach courses exclude Gust, Drop, and Riser, and `src/net/eliteGates/egSpanLaw.js` verifies pendulum flights across `EG_SOLVE_FLIGHT_N` (`24`) instants (`EG_SOLVE_FLIGHT_LAW = 10`).
- **Drops, Voids, and Rings:** Drops span `EG_DROP_LAW10_CM` (`300`) to `EG_DROP_CM` (`450`), triggering the void at `EG_VOID_DROP_M` (`EG_DROP_CM / 100 + 0.25`), including under the arrival plate (`src/net/eliteGates/egFair.js`, `src/net/eliteGates/egWalkGraph.js`, and `src/world/eliteGates/egKit.js`). Ring alcoves preserve walls via `egRingSideWalls` and `egRingSideOpen` around `EG_RING_DOOR` (`2.2 x 2.8` m), and `egPieceAt`, `egStepLocal`, and `egAlongOf` sample pieces.
- **Trial Clock Holds:** In `src/net/eliteGates/egBrain.js`, `egTrialAwaits` holds `EG_AWAIT_CLOCKS` (`waveAt`, `packAt`, `wanderAt`, `escortAt`, `ashAt`, `sparkAt`, `ventAt`, and `quietUntil`) for `yard`, `athenaeum`, `deepway`, and `scriptorium` until `egOnTrialGround` (`egTrialEndAt` marks trial end), and the Deserter closes no rift while `F.await` is set.
