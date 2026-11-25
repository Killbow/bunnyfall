---
slug: sky-ketch-look-overview
title: "Sky-Ketch Look: Shipped Slices, Laws, and the Ketch Lab"
domain: rendering
kind: overview
parent: null
files:
  - src/world/ketch/ketchLook.js
  - src/world/ketch/ketchAtmos.js
  - src/world/ketch/ketchStates.js
  - src/world/ketch/ketchPose.js
  - src/systems/ketch/ketchDeckHost.js
  - src/systems/ketch/ketchFight.js
  - src/render/ketch/ktGaugePass.js
  - src/tools/ketchLab.js
  - src/tools/ketchLabViews.js
  - src/tools/ketchLabLink.js
  - tools/ketchLabProbe.mjs
  - src/render/gateTelegraph.js
  - ketch.html
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sky-Ketch-Look.md"
related:
  - sky-ketch-look-palette-and-grain
  - sky-ketch-look-hourly-light-and-air
  - sky-ketch-look-state-record-pvs-and-gauges
  - sky-ketch-raid-overview
  - tonal-warden-fight-and-downed-crew
  - super-dungeon-look-overview
  - elite-breach-look-overview
invariants:
  - "The look never changes relay law. Nothing in src/net/ketch/ is edited for a look slice, and colliders (ketchColliderOf(buildKetchShip())) are untouched."
  - "Flash law: no look transition is faster than TELEGRAPH_THROB_MAX_HZ (3). A warned bridge section lurches at KT_SECTION_LURCH_HZ 1.5, and arcs change look once per strike (hazardStrike)."
  - "Moving parts never cast shadows. The cage and lamp glass are drawn noShadow, and a bridge section casts only while solid, dy 0 and shake 0."
traps:
  - "Only KL0-KL3 have shipped. The ride veil, score, sprite bakes, ketchFx and ketchRead do not exist yet."
  - "Some shipped comments still cite scenes/ketch/*.js. The live modules are in src/systems/ketch/."
dfu: []
tags:
  - sky-ketch
  - look
  - rendering
  - lab
  - flash-safety
  - polish
---

# Sky-Ketch Look: Shipped Slices, Laws, and the Ketch Lab

The Sky-Ketch visual architecture (`src/world/ketch/`, `src/systems/ketch/`, and `src/render/ketch/ktGaugePass.js`) dresses the cooperative airship raid across slices `KL0` through `KL3` without altering `src/net/ketch/` relay rules or ship colliders (`ketchColliderOf(buildKetchShip())`). Later design slices (`KL4` onward, including ride veils, musical scores, baked enemy sprite sheets, `ketchFx`, and `ketchRead`) are not in the repository.

- **Shipped Slices (`KL0`-`KL3`):** `KL0` introduced the `ketch.html` visual harness and flash-safety fixes, `KL1` added hourly and zone atmosphere rows (`src/world/ketch/ketchAtmos.js`), `KL2` defined the indexed Dwarven palette and luminance ladder (`src/world/ketch/ketchLook.js`), and `KL3` added the zero-allocation frame state record (`src/world/ketch/ketchStates.js`), part-group PVS culling (`src/systems/ketch/ketchDeckHost.js`), and the instanced gauge pass (`src/render/ketch/ktGaugePass.js`).
- **Flash and Shadow Laws:** Every visual oscillation stays at or below `TELEGRAPH_THROB_MAX_HZ` (`3` Hz in `src/render/gateTelegraph.js`). In `src/world/ketch/ketchPose.js` and `src/systems/ketch/ketchFight.js`, warned bridge sections lurch at `KT_SECTION_LURCH_HZ` (`1.5` Hz, down from `6.9` Hz) and hazard arcs swap appearance once per `hazardStrike` rather than `16.7` times per second. Moving parts, the lift cage, and lamp glass render with `noShadow`; bridge sections cast shadows only while solid with `dy = 0` and `shake = 0`.
- **Ketch Lab and Probes:** `ketch.html` (`src/tools/ketchLab.js`, `src/tools/ketchLabViews.js`, and `src/tools/ketchLabLink.js`) parses URL knobs via `ketchLabKnobs` (`grey`, `lite`, `bill`, `sky`, `weather`, `hour`, `eye`, `arena2`, and `gauges`) across `KT_LAB_DECK_VIEWS` cameras, while `tools/ketchLabProbe.mjs` verifies frames against the value ladder and draw budget.
