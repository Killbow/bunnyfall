---
slug: elite-breach-ascent-overview
title: "Elite Breach Ascent: Law 9 Routes and Law 10 Broken Ways"
domain: world
kind: overview
parent: null
files:
  - src/net/eliteGates/egAscent.js
  - src/net/eliteGates/egLaw.js
  - src/net/eliteGates/egDurable.js
  - src/net/eliteGates/egWalkGraph.js
  - src/net/eliteGates/egRouteProof.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Elite-Gates-Ascent.md"
related:
  - elite-breach-spire-overview
  - elite-breach-hall-generator-and-span-solver
  - elite-breach-ascent-route-graph-and-storeys
  - elite-breach-broken-way-and-trial-await
invariants:
  - "`EG_LAWS` in `src/net/eliteGates/egDurable.js` keeps laws 4-8 unchanged and adds laws 9 and 10; older laws lay exactly as they did before."
  - "`EG_ASCENT_LAW` (9, egLaw.js) adds the 3D route graph `spec.route`; `EG_BROKEN_LAW` (10, egAscent.js, re-exported by egLaw.js) adds broken bridges and trial clock holds."
  - "Ascent halls stay inside `EG_ASCENT_BOUND` (x +/-150 m, z -10..158 m = `EG_HALL_LEN_MAX`, y +/-60 m); halls are spaced `EG_HALL_PITCH` 500 m apart, and the court bound is `GATE_COURT_BOUND` 160 (wire.js)."
  - "Route length is capped at `EG_ROUTE_LEN_MAX_M` (640 m) with a median crossing of at most `EG_ROUTE_S_MAX` (300 s)."
traps:
  - "Branch on `egLawOf(spec)` against `EG_ASCENT_LAW`/`EG_BROKEN_LAW`, never on `EG_SPEC` or a relay version literal."
  - "Law 9+ progress is measured along `spec.route` (3D main way); laws 4-8 still measure along z."
dfu: []
tags:
  - elite-gates
  - ascent
  - broken-way
  - spec-law
  - procedural
---

# Elite Breach Ascent: Law 9 Routes and Law 10 Broken Ways

Elite Breach Ascent upgrades Spire halls from linear z-axis spans to multi-storey 3D route graphs (`EG_ASCENT_LAW = 9`) and segmented platforming courses with trial clock holds (`EG_BROKEN_LAW = 10`).

- **Law Registry and Seam:** `EG_LAWS` in `src/net/eliteGates/egDurable.js` preserves laws `4` through `8` untouched while registering laws `9` and `10`. `egLawSeam(law)` in `src/net/eliteGates/egLaw.js` selects the per-law seam, and callers branch on `egLawOf(spec)` against `EG_ASCENT_LAW` or `EG_BROKEN_LAW` (`src/net/eliteGates/egAscent.js`), while wire compatibility checks `EG_RELAY_MIN` and `EG_BRAIN_V` in `src/net/wire.js`.
- **Ascent Envelope and Bounds:** Ascent halls build corridors and rooms across varied elevations, supporting climbing on and off the main path and detailed platforming between sections. Each hall fits inside `EG_ASCENT_BOUND` (`x` within `+/-150` m, `z` from `-10` to `158` m matching `EG_HALL_LEN_MAX`, and `y` within `+/-60` m), spaced by `EG_HALL_PITCH` (`500` m) inside `GATE_COURT_BOUND` (`160` in `src/net/wire.js`).
- **Route Proof and Budgets:** `src/net/eliteGates/egWalkGraph.js` and `src/net/eliteGates/egRouteProof.js` verify that the 3D main way `spec.route` stays within `EG_ROUTE_LEN_MAX_M` (`640` m) and a median crossing time of `EG_ROUTE_S_MAX` (`300` s). Additional caps bound crossings and fragments at `EG_ASCENT_CROSSINGS_MAX` (`2`), `EG_ASCENT_FRAGS_MAX` (`11`), `EG_FRAGS_MAX` (`4`), and `EG_SPEC_SAID_MAX` (`32768`).
- **Subcards:** `elite-breach-ascent-route-graph-and-storeys` covers road links, stacked floor separation, and cross-storey hit resolution; `elite-breach-broken-way-and-trial-await` covers broken bridge segmentation, solver checks, and trial clock holds.
