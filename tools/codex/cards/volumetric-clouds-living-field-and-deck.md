---
slug: volumetric-clouds-living-field-and-deck
title: "Living Clouds: Clocks, Convection, Cells, and Deck Lighting"
domain: rendering
kind: subcard
parent: volumetric-clouds-overview
files:
  - src/render/volumetricClouds.js
  - src/render/enhancedSky.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Volumetric-Clouds-Arc.md"
related:
  - volumetric-clouds-overview
  - volumetric-clouds-rain-curtains-and-cirrus
  - sky-weather-and-lighting
invariants:
  - "cloudClocks(minutes, driftWorld) reads only game minutes and the wind integral. The shape evolves EVOLVE_M_PER_MINUTE = 120 and the detail DETAIL_EVOLVE_M_PER_MINUTE = 300, each wrapped to its own volume. Cover drifts at COVER_DRIFT_SHARE = 0.6 of the air and turns COVER_EVOLVE_PER_MINUTE = 1/1440."
  - "`convection` lags solar noon by `CONVECTION_LAG_MINUTES = 150`, scaling depth from `CONVECTION_DEPTH_FLOOR = 0.4` to `1` on `FAIR_WEATHERS` (`sunny`, `cloudy`) while keeping weather-table cover unchanged."
  - "grownCell grows a cell from GROWTH_FLOOR { cover 0.5, depth 0.45, density 0.7 } at env 0 to the full profile. Its fall scales by env."
  - "deckWeight() = smoothstep(DECK_COVER_LO 0.4, DECK_COVER_HI 0.95, cover) * smoothstep(0, DECK_VARY_FULL, vary). It is the single source for lanes, stride evidence and lightOctaves."
traps:
  - "`duskWeight(sunY, dayWeight)` runs on the CPU and uploads as `uDusk`; never derive dusk from `uLightDir`, which points toward the moon at night."
  - "DECK_VARY_FULL is computed as the minimum non-zero VC_PROFILE vary (overcast 0.15). Fog and sandstorm (vary 0) must never get lanes or octaves."
dfu: []
tags:
  - clouds
  - convection
  - weather-cells
  - multiple-scattering
  - dusk
---

# Living Clouds: Clocks, Convection, Cells, and Deck Lighting

`src/render/volumetricClouds.js` and `src/render/enhancedSky.js` drive cloud evolution, afternoon thermal convection, local weather cells, and multi-octave deck scattering from game minutes and integrated wind drift.

- **Clocks, convection, and cells:** `cloudClocks(minutes, driftWorld)` advances shape at `EVOLVE_M_PER_MINUTE = 120` and detail at `DETAIL_EVOLVE_M_PER_MINUTE = 300` (each wrapped to its volume period), while cover drifts at `COVER_DRIFT_SHARE = 0.6` of air motion and turns at `COVER_EVOLVE_PER_MINUTE = 1/1440`. On `FAIR_WEATHERS` (`sunny` and `cloudy`), `convection` lags solar noon by `CONVECTION_LAG_MINUTES = 150`, scaling depth between `CONVECTION_DEPTH_FLOOR = 0.4` and `1` without changing weather-table cover. `grownCell` interpolates a cell from `GROWTH_FLOOR` (`{ cover: 0.5, depth: 0.45, density: 0.7 }`) at `env = 0` to its full `VC_PROFILE` row (`base`, `top`, `density`, `dark`, `flat`, `shear`, and `vary`), scaling precipitation fall by `env`.
- **Deck weight and lighting:** `deckWeight()` multiplies `smoothstep(DECK_COVER_LO = 0.4, DECK_COVER_HI = 0.95, cover)` by `smoothstep(0, DECK_VARY_FULL, vary)` (`0.15` for overcast; `0` on fog and sandstorm) to gate `3x` empty-space strides (`SKIP_ROOM = 0.02`), `columnAt` lane shaping (`CELL_BASE_LIFT = 0.07`, `CELL_THIN = 0.55`), `columnAbove` ambient (`COLUMN_FILL = 0.5`, `AMBIENT_THROUGH_K = 0.35`, `AMBIENT_FLOOR = 0.15`), and `lightOctaves(tau, phase, deck)` (`MS_OCTAVES = 3`, `MS_A = 0.5`, `MS_B = 0.35`, `MS_C = 0.5` over `msSum()`). `cloudLight` holds direct sun until `horizonDip(mid)` (`EARTH_RADIUS_M = 6371000`), while CPU `duskWeight(sunY, dayWeight)` uploads `uDusk`.
