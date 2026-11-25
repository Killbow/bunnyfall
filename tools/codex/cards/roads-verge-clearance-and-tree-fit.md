---
slug: roads-verge-clearance-and-tree-fit
title: "Roadside Verge Clearance (VERGE1) and Low Poly Tree Crown/Trunk Fit"
domain: world
kind: subcard
parent: roads-network-overview
files:
  - src/world/roadVerge.js
  - src/world/roadBand.js
  - src/world/roadClearance.js
  - src/world/lptCrowns.js
  - src/world/pixelBuild.js
  - src/scenes/shared.js
  - src/mods/features.js
routes: []
tables: []
replacesBible:
  - "03-World/Roads.md"
related:
  - roads-painter-seam-and-paths-mask
  - low-poly-trees-overview
  - low-poly-trees-near-set-and-handover
  - bantha-jungle-trails-and-roadside-pairs
invariants:
  - "`PATH_HALF_M = PATH_HALF_WIDTH / UNITS_PER_METRE` (`P_SIZE/2 = 256` units at 40 units per meter = 6.4 m). The band is two tiles wide about each compass arm."
  - "roadRoom measures disc-to-segment room from a pixel-local point to the nearest road/track band. vergeClear is roadRoom >= radius."
  - "roadVergesOn: Features row `road-verges` (pref roadVerges) on the enhanced skin, forced on online. `?verges=off` disables it offline only."
  - "lptFitCap scales a location tree's crown down to room/crown, and lptTrunkCap scales against solid props using LPT_TRUNKS. Both never go below LPT_FIT_FLOOR (0.2) and return Infinity when unconstrained."
  - "pixelBuild only reads the verge network when verges are on and the pixel was built withRoads."
traps:
  - "Fit scales trees down; it never moves trees or clips streets. Do not add relocation logic."
  - "roadBand is shared with the jungle roadside pairs through pathsDataPoint. Do not fork a second network reader."
dfu: []
tags:
  - verge
  - roadside
  - low-poly-trees
  - trunk-fit
  - clearance
---

# Roadside Verge Clearance (VERGE1) and Low Poly Tree Crown/Trunk Fit

Roadside verge clearance (`VERGE1`) keeps wild flora out of the two-tile road corridor while scaling nearby Low Poly Trees (`LPT`) down so crowns and trunks fit without relocating trees (`src/world/roadVerge.js`, `src/world/roadBand.js`, `src/world/roadClearance.js`).

## Corridor Geometry and Feature Gate

- **Half-width and room queries (`src/world/roadBand.js`, `src/world/roadVerge.js`):** Each compass arm (`ARMS`) spans a two-tile band with half-width `PATH_HALF_M = PATH_HALF_WIDTH / UNITS_PER_METRE` (`P_SIZE / 2 = 256` units at `40` units per meter, or `6.4` meters). `roadRoom` measures the disc-to-segment distance from a pixel-local point to the nearest road or track band, and `vergeClear` requires `roadRoom >= radius`. `roadVerge.js` also provides `natureReach`, `lptCrownOf`, `tileRoom`, and `pathTileMask`, while sharing `roadBand.js` with jungle roadside pairs via `pathsDataPoint`.
- **Feature toggle (`src/scenes/shared.js`, `src/mods/features.js`, `src/world/pixelBuild.js`):** `roadVergesOn` reads the `road-verges` feature row (`roadVerges` preference) on the enhanced skin, is forced on in online play, and honors `?verges=off` offline only. `pixelBuild` consults the verge network only when verges are enabled and the pixel was built with `withRoads`.

## Crown and Trunk Scaling

- **Fit caps (`src/world/roadClearance.js`, `src/world/lptCrowns.js`, `src/world/pixelBuild.js`):** `lptFitCap` scales a location tree's crown to `room / crown`, while `lptTrunkCap` (`TRUNK-FIT`) checks solid props against `LPT_TRUNKS[lpt.key]`. Both clamp at `LPT_FIT_FLOOR` (`0.2`), return `Infinity` when unconstrained, and scale trees in place without moving them.
