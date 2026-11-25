---
slug: biome-precipitation-air-and-phase
title: "Modeled Air Temperature and the Rain/Sleet/Snow Phase"
domain: rendering
kind: subcard
parent: biome-precipitation-overview
files:
  - src/weather/airTemperature.js
  - src/weather/airGround.js
  - src/weather/weatherSim.js
  - src/weather/weatherFront.js
  - src/weather/weatherMap.js
  - src/render/precipitation.js
  - src/render/rainCurtains.js
  - src/render/volumetricClouds.js
  - src/world/jungle/jungleHost.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Biome-Precipitation.md"
related:
  - biome-precipitation-overview
  - biome-precipitation-snowpack-and-ground
  - sky-weather-and-lighting
invariants:
  - "airTemperature = seasonAir + dayAir(cloud cover) + p.spell * spellAt - LAPSE_C_PER_M * max(0, h) - airFall chill. Here h defaults to the ground's mean height from airGround().groundAt."
  - "snowShareOf returns 1 at SNOW_ALL_C = 0 C and below, 0 at RAIN_ALL_C = 2.5 C and above, and a smoothstep in between (sleet)."
  - "phaseRound(raw, share) returns 'snow' when share >= 0.5. Otherwise a raw 'snow' becomes 'rain' and any other raw word stays itself, so a sub-freezing thunderstorm still strikes."
  - "systemWordOf and weatherSystemStamp move only on a new system. A phase flip alone (weatherPhaseFlip) never starts a front, an episode, or a wind change."
traps:
  - "lawAirGround reads CLIMATE.PAK undilated (pak.undilated ?? pak.buffer), never the coastal texture dilation, so every online client reads one air."
  - "PrecipitationRenderer.drawFall offsets the flake volume by MIX_SHIFT at every share > 0 and splits a count cap by share. Never swap the wind's own travel array."
dfu:
  - Assets/Scripts/Terrain/TerrainMaterialProvider.cs
tags:
  - air-temperature
  - lapse-rate
  - sleet
  - snow-share
  - weather-front
---

# Modeled Air Temperature and the Rain/Sleet/Snow Phase

`src/weather/airTemperature.js` and `src/weather/airGround.js` compute continuous air temperature to drive rain, sleet, and snow transitions without resetting active weather systems.

## Air Model and Geographic Blending

`airTemperature` sums `seasonAir`, `dayAir` (damped by cloud cover), `p.spell * spellAt`, altitude lapse `-LAPSE_C_PER_M * max(0, h)` (`0.0065` C/m above `SEA_LEVEL_M`, defaulting `h` to `airGround().groundAt`), and `-airFall` chill (`FALL = { dayUnderCloud: 0.4, chill: 1.5, snowCold: 1.5 }`). The 360-day cycle peaks at `WARMEST_HOUR = 15` and troughs at `COLDEST_DAY = 20` (21st of Morning Star), adding `LATITUDE_C_PER_ROW = 0.008` C per row south of a climate median. `SPELL` blends two drifting value-noise octaves (`240000` m by `5760` min at weight `0.7`; `60000` m by `1440` min at weight `0.3`, drifting `[18, 6]` m/min). `lawAirGround` reads undilated `CLIMATE.PAK` (`pak.undilated ?? pak.buffer`), blends coastal air via `MARITIME` (`{ coast: 0.5, inland: 12, offshore: 12, reach: 12 }`), and shifts toward Rainforest by `jungleAirShare` (`setAirBiome('jungle', ...)` in `src/world/jungle/jungleHost.js`).

## Phase Rounding and Rendering

`snowShareOf` returns `1` at `SNOW_ALL_C = 0` C, `0` at `RAIN_ALL_C = 2.5` C, and a sleet smoothstep between them. `phaseRound(raw, share)` yields `'snow'` when `share >= 0.5` and turns raw `'snow'` into `'rain'` below `0.5` while keeping thunderstorm words intact. `systemWordOf` and `weatherSystemStamp` change only on new systems, never on `weatherPhaseFlip`. `PrecipitationRenderer.drawFall` offsets flakes by `MIX_SHIFT`, while `weatherFront`, `phaseTerms`, `rainCurtains` (`mixColor`), and `volumetricClouds` blend by share.
