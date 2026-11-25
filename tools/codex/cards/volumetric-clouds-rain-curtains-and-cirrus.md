---
slug: volumetric-clouds-rain-curtains-and-cirrus
title: "Rain Curtains, Virga, Cirrus, and Disjoint Per-Ray Spans"
domain: rendering
kind: subcard
parent: volumetric-clouds-overview
files:
  - src/render/volumetricClouds.js
  - src/render/rainCurtains.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Volumetric-Clouds-Arc.md"
related:
  - volumetric-clouds-overview
  - volumetric-clouds-living-field-and-deck
  - biome-precipitation-air-and-phase
invariants:
  - "Rain curtains integrate analytically inside the sky march as cylinders of `CURTAIN_SHARE = 0.55` cell radius with `CURTAIN_EXT = 0.0006` per meter at full fall, extending `CURTAIN_INTO = 0.12` of cell depth into the cloud base."
  - "`veilPiece` (`src/render/rainCurtains.js`) integrates curtain segments via Simpson rule across `VEIL_PANELS = 16`, fading each sample by distance (`veilFade`, `CURTAIN_FADE_M = 40000`)."
  - "Cirrus evaluates one sample per ray at `CIRRUS_ALT_M = 9000` via the sphere root and fades across `CIRRUS_FADE_M = 120000`."
traps:
  - "`raySpans` (`addSpan`/`spanA`/`spanB`) constructs disjoint per-ray intervals for the ambient zone and weather cells so rays never waste steps marching empty air below distant cells."
  - "`aerial(t) = 1 - exp(-t / 14000)` evaluates at each sample distance `t` rather than span start, and `farA(rest)` composites far slabs in horizon color."
dfu: []
tags:
  - rain-curtains
  - virga
  - cirrus
  - aerial-perspective
  - raymarch
---

# Rain Curtains, Virga, Cirrus, and Disjoint Per-Ray Spans

`src/render/volumetricClouds.js` and `src/render/rainCurtains.js` integrate analytical precipitation shafts, high-altitude cirrus ice sheets, and disjoint raymarch intervals (`raySpans`, `addSpan`, `spanA`, and `spanB`) across the hemisphere sky dome.

- **Disjoint spans and aerial perspective:** `raySpans` splits the ambient cloud slab and distant weather cells into separate intervals (`spanA` and `spanB` via `addSpan`) so rays skip empty air beneath remote cells. Each sample at distance `t` applies `aerial(t) = 1 - exp(-t / 14000)` rather than evaluating once at the span start, while `farA(rest)` composites far slabs in horizon color.
- **Rain curtains and virga (`src/render/rainCurtains.js`):** Curtains render inside the sky march as cylinders of `CURTAIN_SHARE = 0.55` cell radius with extinction `CURTAIN_EXT = 0.0006` per meter at full fall, extending `CURTAIN_INTO = 0.12` of cell depth into the cloud base. `CURTAIN_FALL` sets `[weight, pale]` to `[1, 0]` for rain, `[1.3, 0]` for thunder, and `[0.7, 1]` for snow while skipping cloud, fog, and sandstorm. Rim streaks terminate as virga around `CURTAIN_VIRGA = 0.6` of the base (up to `0.9`, clamped below `0.95`) while the core reaches the ground, and `veilPiece` integrates `VEIL_PANELS = 16` via Simpson rule with `veilFade` (`CURTAIN_FADE_M = 40000`).
- **Cirrus shell:** One sample per ray intersects `CIRRUS_ALT_M = 9000` (`CIRRUS_FADE_M = 120000`, `CIRRUS_COVER`, `CIRRUS_TAU = 0.6`), drifting east via `CIRRUS_JET_M_PER_MINUTE` (`CIRRUS_JET_RATIO = 5` times sunny wind, `WIND_SECONDS_PER_MINUTE`, and `WORLD_PER_DRIFT`, wrapped by `cloudClocks().cirrus`) and lit by `cirrusLight` out to `horizonDip(9000)`.
