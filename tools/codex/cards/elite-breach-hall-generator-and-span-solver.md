---
slug: elite-breach-hall-generator-and-span-solver
title: "Integer Hall Generator, Span Solver, and Fragments"
domain: world
kind: subcard
parent: elite-breach-spire-overview
files:
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egSpanLaw.js
  - src/net/eliteGates/egFragLaw.js
  - src/net/eliteGates/egHeroFrags.js
  - src/net/eliteGates/egAscent.js
  - src/net/eliteGates/egWalkGraph.js
  - src/world/eliteGates/egHall.js
  - src/world/eliteGates/egCircleWorker.js
  - src/world/eliteGates/egCircleParts.js
  - src/systems/eliteGates/egSpan.js
  - src/world/sdSteps.js
replacesBible:
  - "11-Multiplayer/Elite-Gates.md"
related:
  - elite-breach-spire-overview
  - elite-breach-clock-and-hall-rhythm
  - shattered-hour-orrery-and-steps
invariants:
  - "`egHallOf`, `egSpanOf`, and the fragment law are deterministic per spec law (`EG_SPEC` 10); any draw change increments the law number so older laws keep laying identically."
  - "Halls cap length at `EG_HALL_LEN_MAX` (158 m); falling below `EG_VOID_Y` (`SD_VOID_Y = -30`) casts the player back and deducts `EG_CAST_BACK_LOSS` (0.1) down to `EG_CAST_BACK_FLOOR` (0.25)."
  - "The timed span solver enforces an `EG_WINDOW_MIN` (0.5 s) crossing window, an `EG_WAIT_MAX` (4 s) maximum wait, at most `EG_RELAY_MAX` (8) re-lays, and a shaft median within `EG_SHAFT_MAX_S` (15 s)."
  - "`EG_FRAG_BUDGET` caps each fragment at 12,000 triangles, 3,000 collider triangles, 4 lights, and 12 draws, while `EG_LAMP_BUDGET` caps active lamps at 12 within 40 m."
traps:
  - "Hero fragments require `EG_HERO_LAND_ROOM_CM` (40 cm) of landing clearance and spawn only from `EG_HERO_LAW` (7) onward."
  - "`EG_ASCENT_LAW` (9) introduces routed ascent ways and `EG_BROKEN_LAW` (10) adds broken ways; always branch on `egLawOf(spec)` rather than comparing against `EG_SPEC` directly."
  - "Running leap is disabled inside the Spire so player movement physics match the span solver's jump envelope."
tags:
  - procedural
  - generator
  - solver
  - fragments
  - determinism
---

Spire circles (`src/world/eliteGates/egHall.js`, `src/world/eliteGates/egCircleWorker.js`, and `src/world/eliteGates/egCircleParts.js`) assemble deterministic halls, traversal spans, and geometry fragments shared between the relay and client workers.

## Deterministic Laws, Hall Bounds, and Ascent Ways

`egHallOf` (`src/net/eliteGates/egLaw.js`), `egSpanOf` (`src/net/eliteGates/egSpanLaw.js`), and `src/net/eliteGates/egFragLaw.js` generate layouts purely from integer streams versioned by `egLawOf(spec)` (current `EG_SPEC = 10`). Code must branch on `egLawOf(spec)` so in-progress runs on older laws reconstruct the same geometry: `EG_HERO_LAW` (`7`) enables hero fragments (`src/net/eliteGates/egHeroFrags.js`), `EG_ASCENT_LAW` (`9`) adds routed ways (`src/net/eliteGates/egAscent.js` and `src/net/eliteGates/egWalkGraph.js`), and `EG_BROKEN_LAW` (`10`) adds broken ways.

Halls extend at most `EG_HALL_LEN_MAX` (`158` m). Dropping below `EG_VOID_Y` (`SD_VOID_Y = -30` from `src/world/sdSteps.js`) casts the player back to a safe ledge and drains `EG_CAST_BACK_LOSS` (`0.1`) health down to `EG_CAST_BACK_FLOOR` (`0.25`).

## Timed Span Solver and Fragment Budgets

Moving platforms, pendulums, and gust links (`EG_GUST_REACH_M = 6` m per span link in `src/systems/eliteGates/egSpan.js`) are verified at generation time. The solver requires a passable window of at least `EG_WINDOW_MIN` (`0.5` s), a wait of at most `EG_WAIT_MAX` (`4` s), a shaft median within `EG_SHAFT_MAX_S` (`15` s), and at most `EG_RELAY_MAX` (`8`) re-lay attempts. Running leap is refused in the Spire so the motor never diverges from solver proofs. Circles exceeding `EG_GHOSTS_MAX` (`48`) ghost only neighboring halls.

Hero fragments require `EG_HERO_LAND_ROOM_CM` (`40` cm) of landing room. Every fragment obeys `EG_FRAG_BUDGET` (`12,000` visual tris, `3,000` collider tris, `4` lights, and `12` draw calls) alongside `EG_LAMP_BUDGET` (`12` lamps within `40` m).
