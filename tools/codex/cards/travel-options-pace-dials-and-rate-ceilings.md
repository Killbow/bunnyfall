---
slug: travel-options-pace-dials-and-rate-ceilings
title: "Travel Pace Dials, Road Rule, and Rate Ceilings"
domain: world
kind: subcard
parent: travel-options-journey-overview
files:
  - src/travel/travelPace.js
  - src/world/timeScale.js
  - src/travel/travelThreat.js
  - src/travel/travelPaths.js
  - src/travel/townWalk.js
  - src/travel/travelOptions.js
  - src/player/motor.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Travel-Options.md"
related:
  - travel-options-journey-overview
  - travel-view-roaming-bands-and-threat
  - wild-zone-travel-strangers-and-zone-limits
  - online-time-arc-overview
invariants:
  - "`PACE_STEPS = [5, 10, 20, 30, 40, 60, 100]`. The dials are `'speed'` and `'foe'`, with defaults `{ speed: OPEN_PACE_MAX, foe: 5 }`, stored on the device under `TRAVEL_PACE_STORE_KEY` and never in a save."
  - "Road rule: `x100` (`ROAD_PACE_MAX`) applies only on a road or track. Elsewhere the top is `OPEN_PACE_MAX` (`60`). `PACE-KEEP` caps the dial (`paceNow`/`paceRateOn`) and never rewrites it."
  - "`TRAVEL_ROAD_RATE` and `TRAVEL_OPEN_RATE` in `src/world/timeScale.js` alias `ROAD_PACE_MAX` and `OPEN_PACE_MAX`. `travelRateOf(onRoad) = paceRateOn(onRoad)`. `setTimeScale` clamps to `[0.01, MAX_TIME_SCALE]` (`100`)."
  - "`applyRate` caps town streets at `TOWN_PACE_MAX` (`5`, `src/travel/townWalk.js`), the ring walk at `MAX_CIRCUMNAVIGATION_ACCEL` (`15`), and everything else at `travelRateOf(journeyOnRoad())`."
traps:
  - "`RATE-LAW` claiming 'no dials' is outdated: `PACE-DIALS` restored the player dials under the road rule."
  - "`foePaced(cap, want) = min(want, max(cap, paceNow('foe') ?? JOURNEY_FOE_PACE))`. `TIME-DILATION` holds `x1` inside a hostile ship hold."
  - "`WILD3`: in the open PvP zone, `WILD_PACE_CAP` (`{ road: 40, open: 20 }`) caps the ground top via `setPaceZoneCap`."
dfu: []
tags:
  - travel-options
  - time-scale
  - pace
  - enemies
  - road-rule
---

`src/travel/travelPace.js` and `src/world/timeScale.js` govern accelerated journey dials, road versus cross-country rate ceilings, threat slowdowns, and fixed-step physics scaling.

## Pace Dials and the Road Rule

Under `PACE-DIALS` (superseding the older dial-less `RATE-LAW`), players adjust `'speed'` and `'foe'` dials along `PACE_STEPS` (`[5, 10, 20, 30, 40, 60, 100]`). Dial choices default to `{ speed: OPEN_PACE_MAX, foe: 5 }` and persist in device storage under `TRAVEL_PACE_STORE_KEY` rather than save files.

The road rule limits `x100` (`ROAD_PACE_MAX = 100`, aliased as `TRAVEL_ROAD_RATE`) to roads and tracks (`journeyOnRoad()` in `src/travel/travelPaths.js`). Off-road travel caps at `OPEN_PACE_MAX` (`60`, aliased as `TRAVEL_OPEN_RATE`). Leaving a road (`PACE-KEEP`) clamps the effective multiplier through `paceNow` and `paceRateOn` (`travelRateOf(onRoad) = paceRateOn(onRoad)`) without overwriting the stored `'speed'` dial. Inside the Wrothgarian open PvP zone (`WILD3`), `setPaceZoneCap` applies `WILD_PACE_CAP` (`{ road: 40, open: 20 }`).

## Context Caps, Threat Pacing, and Fixed Steps

During active travel (`src/travel/travelOptions.js`), `applyRate` clamps settlement interiors to `TOWN_PACE_MAX` (`5` in `src/travel/townWalk.js`), town perimeter walks to `MAX_CIRCUMNAVIGATION_ACCEL` (`15`), and open overland legs to `travelRateOf(journeyOnRoad())`. When enemies approach (`src/travel/travelThreat.js`), `foePaced(cap, want)` evaluates `min(want, max(cap, paceNow('foe') ?? JOURNEY_FOE_PACE))` where `JOURNEY_FOE_PACE` is `5`, while `TIME-DILATION` locks the rate to `x1` inside a hostile ship hold.

`setTimeScale` clamps the active multiplier to `[0.01, MAX_TIME_SCALE]` (`100`). In `src/player/motor.js`, the physics motor multiplies its fixed step size by `timeScale()` (matching `Time.fixedDeltaTime` scaling) so step frequency stays constant while each step covers more distance. Pausing never sets `timeScale` to `0`; modal pauses hold the frame loop via `gamePaused` and `_overlayHeld`.
