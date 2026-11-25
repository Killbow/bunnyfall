---
slug: "weather-arc-map-systems-and-crossings"
title: "Weather Map Systems, Birth Law, Fronts, and Crossings"
domain: "rendering"
kind: "subcard"
parent: "weather-arc-overview"
files:
  - "src/weather/weatherMap.js"
  - "src/weather/weatherSim.js"
  - "src/weather/weatherTable.js"
  - "src/weather/wind.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/frame/skyFrame.js"
  - "src/scenes/exterior.js"
routes: []
tables: []
replacesBible:
  - "07-Rendering/Weather-Arc.md"
related:
  - "weather-arc-overview"
  - "weather-arc-ground-law-and-sandstorm"
  - "biome-precipitation-air-and-phase"
  - "online-time-sky-law-and-cutover"
invariants:
  - "PRIORITY = ['thunder', 'rain', 'snow', 'sandstorm', 'fog', 'overcast', 'cloudy']; wornAmong picks the highest-ranked system covering a place, and no system means clear."
  - "birthLaw(climateIndex, season) solves birth weights backwards from the DFU table odds (targetShares) so day-averaged shares match; WET_HOURS = { rain: 0.5, thunder: 0.5 } halves wet hours and frees the rest to dry words (RAIN-HOURS)."
  - "Rain fronts have 40-75 km cores; thunderstorm cells are children found through their front and paint only inside its core (insideClip, clip); a cell dies with its front."
  - "A sample within STALE_DRAIN_MINUTES (30) and MAP_JUMP_M (2000 m) of the last is a crossing (weatherCrossingStamp) and takes the CROSS_LEAD_MIN = 6 front lead in src/weather/wind.js; anything further is an arrival (weatherArrivalStamp) and snaps."
traps:
  - "Systems are re-found once per game minute or every MAP_REFIND_M = 250 m moved, gathered to FIELD_RANGE_M (40000 m) + 250 m; caching narrower breaks crossings at the edge."
  - "Indoor frames re-read the map at the building or dungeon coordinates (host.weatherIndoors, sampleWeatherIndoors) and every indoor sample counts as an arrival, never a crossing."
  - "Birth memo BIRTHS_MEMO = 40000 nodes sheds its oldest quarter when full; never clear it per frame."
dfu:
  - "Assets/Scripts/Game/WeatherManager.cs"
tags:
  - "weather-map"
  - "poisson"
  - "fronts"
  - "crossings"
  - "birth-law"
---

# Weather Map Systems, Birth Law, Fronts, and Crossings

`src/weather/weatherMap.js` resolves overlapping weather systems by `PRIORITY = ['thunder', 'rain', 'snow', 'sandstorm', 'fog', 'overcast', 'cloudy']`, where `wornAmong` picks the highest-ranked covering system and the absence of any system yields clear weather.

- **Birth weights and rain fronts (`src/weather/weatherMap.js`, `src/weather/weatherTable.js`):** `birthLaw(climateIndex, season)` solves birth weights backward from `targetShares` so day-averaged shares match table odds, while `WET_HOURS = { rain: 0.5, thunder: 0.5 }` halves wet hours and redistributes the remainder to dry words (`SAND_SHARE_OF_CLOUDY = 0.25`). Rain fronts span `40` to `75` km cores tapering from `1` at the center to `EDGE_INTENSITY = 0.2` at the rim (`bandAt`, `bandIntensityAt`), with `systemStrength(type, id)` drawing a heart on `STRENGTH.rain = [EDGE_INTENSITY, 1]` via `seededFirst(idHash(id) ^ STRENGTH_SEED)`. Thunderstorm cells spawn as children clipped inside their parent front (`insideClip`, `clip`) and die with it. Outlines evaluate `SHAPE_AMPS` (`shapeFactor`, `radialOf`), and `forecastAt` walks `weatherAt` forward (`hours = 12`, `step = 15`).
- **Refind caching, crossings, and wind (`src/weather/weatherSim.js`, `src/weather/wind.js`, `src/scenes/worldModes.js`, `src/scenes/frame/skyFrame.js`, `src/scenes/exterior.js`):** Systems are gathered to `FIELD_RANGE_M` (`40000` m) plus `250` m every game minute or `MAP_REFIND_M = 250` m moved, backed by `BIRTHS_MEMO = 40000`. Samples within `STALE_DRAIN_MINUTES` (`30`) and `MAP_JUMP_M` (`2000` m) emit `weatherCrossingStamp` with `CROSS_LEAD_MIN = 6` in `tick(nowMinutes, weather, violenceWord, approachNow)` (where `approachAt` reaches `APPROACH_M = 15000` m); larger jumps or indoor samples (`host.weatherIndoors`, `sampleWeatherIndoors`) emit `weatherArrivalStamp` and snap.
