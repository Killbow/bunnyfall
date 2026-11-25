---
slug: biome-precipitation-overview
title: "Biome Precipitation: Air-Decided Rain, Sleet, Snow, and Ground Snow"
domain: rendering
kind: overview
parent: null
files:
  - src/weather/weatherSim.js
  - src/weather/airTemperature.js
  - src/weather/airGround.js
  - src/weather/snowpack.js
  - src/weather/snowCoverHost.js
  - src/scenes/world.js
  - src/scenes/exterior.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Biome-Precipitation.md"
related:
  - biome-precipitation-air-and-phase
  - biome-precipitation-snowpack-and-ground
  - sky-weather-and-lighting
  - shader-warm-and-time-sliced-budgets
  - performance-priority-overview
invariants:
  - "precipLawOn() is true only when snowGroundLawOn(), weatherMapOn(), and non-null airGround() all hold, and the page is online or ?biomeprecip is not 'off'. setPrecipLaw overrides it in tests."
  - "snowGroundLawOn() requires ?snowground not 'off', isEnhanced() and the enhancedEnvironments pref."
  - "src/scenes/world.js calls setAirGround(lawAirGround(...)) and createSnowCoverHost({ owns: precipLawOn, ... }). src/scenes/exterior.js calls setAirGround(null), so fixed cities keep DFU's seasonal law."
  - "The classic lane keeps DFU's calendar word and ground archive swap 1:1."
traps:
  - "?biomeprecip=off is refused online (one room, one sky, one ground), so do not rely on it to disable the law in multiplayer."
  - "Code comments still cite systems/weather/ and scenes/snowCoverHost.js. The live modules are under src/weather/ and src/world/."
dfu:
  - Assets/Scripts/Terrain/TerrainMaterialProvider.cs
  - Assets/Scripts/Internal/DaggerfallLocation.cs
tags:
  - weather
  - precipitation
  - snow
  - biome
  - enhanced-lane
---

# Biome Precipitation: Air-Decided Rain, Sleet, Snow, and Ground Snow

In Daggerfall Unity (`TerrainMaterialProvider.GetClimateInfo`), winter advances `groundArchive++` across every non-desert climate strictly by calendar season, without a temperature model. On the enhanced lane, precipitation phase and ground snow cover derive instead from modeled air temperature at a given map coordinate, altitude, and minute (`src/weather/airTemperature.js`, `src/weather/weatherSim.js`, `src/weather/snowpack.js`, and `src/weather/snowCoverHost.js`).

## Activation Gates and Scene Wiring

- **Law gates (`src/weather/weatherSim.js`, `src/weather/snowCoverHost.js`):** `precipLawOn()` holds only when `snowGroundLawOn()`, `weatherMapOn()`, and a non-null `airGround()` (`src/weather/airGround.js`) are active, and either the session is online or `?biomeprecip` is not `'off'` (`setPrecipLaw` overrides this in tests). Online sessions ignore `?biomeprecip=off` so all peers share identical sky and ground state. `snowGroundLawOn()` requires `isEnhanced()`, the `enhancedEnvironments` preference, and `?snowground` not set to `'off'`.
- **World versus fixed exterior scenes (`src/scenes/world.js`, `src/scenes/exterior.js`):** Streaming overworld sessions wire `setAirGround(lawAirGround(...))` and `createSnowCoverHost({ owns: precipLawOn, ... })`. Fixed exterior scenes call `setAirGround(null)`, retaining the classic seasonal calendar law, and the classic lane preserves the calendar weather word and archive swap of Daggerfall Unity 1:1.
- **Continuous share versus discrete word:** Snow share is continuous, whereas the discrete weather word is its rounded summary for flags and music.
