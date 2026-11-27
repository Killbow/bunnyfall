---
slug: travel-view-routing-and-load-governor
title: "Road Routing, Town Walks, and the Streaming Load Governor"
domain: world
kind: subcard
parent: travel-view-overworld-overview
files:
  - src/travel/travelRoute.js
  - src/travel/travelGovernor.js
  - src/travel/townWalk.js
  - src/travel/townWalkHost.js
  - src/travel/travelAutopilot.js
  - src/platform/buildBreather.js
  - src/world/streamingWorld.js
replacesBible:
  - "06-Systems/Travel-View.md"
related:
  - travel-view-overworld-overview
  - pixel-streaming-and-origin-shift
  - naval-and-come-sail-away
invariants:
  - "Overland A* uses `ROUTE_COST` (`road = 1`, `track = 1.6`, `open = 3.5`), while maritime legs use `SEA_COST` (`sea = 1.2`, `coast = 1.5`, `shore = 6`) with boarding and landfall transitions."
  - "`openStepBlocked`, `openBlocked`, and `peak` return false, so no open-terrain step is refused for mountain climate (`TV_MOUNTAIN_CLIMATE = 226`) or a rise above `TV_STEEP_RISE` (`16`)."
  - "The streaming load governor halves the speed ceiling (rounded to multiples of `5`, minimum `1`) after `TV_GOV_HOLD_S` (`0.25` s) of unbuilt ground, waits `TV_GOV_SETTLE_S` (`2` s) before cutting again, and climbs one `TV_GOV_STEP` (`5`) per `TV_GOV_CLEAR_S` (`4` s) clean window."
  - "Within town borders, speed caps at `TOWN_PACE_MAX` (`5`), and `townWalk.js` runs weighted A* (`TOWN_WAY_H_WEIGHT = 1.5`) through gates within `GATE_REACH_CELLS` (`24`)."
  - "When the host passes `owed` pixels, `step` caps the rate with `leadCap` so the traveller needs at least `TV_GOV_LEAD_S` (`4` s) of real time to reach the nearest owed pixel; the halving runs only on a bare `unbuilt` count."
traps:
  - "Nighttime locked gates end a town walk at the gate with a shut notice rather than walking the player into the city wall."
  - "Failed terrain tile builds back off and retry at `BUILD_RETRY_MS` (`2`, `4`, `8`, `16`, and `32` s)."
tags:
  - routing
  - a-star
  - governor
  - town-navmesh
  - streaming
---

Overworld autopilot combines regional A* road and sea routing, local town street pathfinding, and a streaming governor that throttles travel speed when terrain generation falls behind.

## Overland and Maritime Routing

`src/travel/travelRoute.js` searches up to `ROUTE_MAX_EXPANSIONS` (`200000` states) using `ROUTE_COST` weights (`road = 1`, `track = 1.6`, `open = 3.5`) and `SEA_COST` weights (`sea = 1.2`, `coast = 1.5`, `shore = 6`) across boarding and landfall points. The mountain and steep-rise tests always return false, so no open land step is refused for climate or slope and mountains need no road. Rendered route polylines clip to the viewport plus `ROUTE_CLIP_PX` (`16` px).

## Town Walks and the Streaming Load Governor

Inside settlement bounds, `src/travel/townWalk.js` and `src/travel/townWalkHost.js` cap movement at `TOWN_PACE_MAX` (`5`) and path across the local street grid with weighted A* (`TOWN_WAY_H_WEIGHT = 1.5`), routing through wall gates within `GATE_REACH_CELLS` (`24`). If a gate is locked for the night, the walk stops cleanly at the gate with a notice.

To keep fast travellers from outrunning terrain builds (`src/travel/travelGovernor.js`), `createLoadGovernor` watches ahead of `travelAutopilot.js`. After `TV_GOV_HOLD_S` (`0.25` s) of unbuilt ground, it halves the speed ceiling (stepped to multiples of `5`, floored at `1`), enforces a `TV_GOV_SETTLE_S` (`2` s) cooldown before another cut, and restores one `TV_GOV_STEP` (`5`) per `TV_GOV_CLEAR_S` (`4` s) of clean streaming. Failed pixel builds retry across `BUILD_RETRY_MS` (`2`, `4`, `8`, `16`, and `32` s).
