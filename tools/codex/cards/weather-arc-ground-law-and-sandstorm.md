---
slug: "weather-arc-ground-law-and-sandstorm"
title: "No Rain Over Snow, Cloud Cells by Place, and the Sandstorm"
domain: "rendering"
kind: "subcard"
parent: "weather-arc-overview"
files:
  - "src/weather/weatherSim.js"
  - "src/world/climateSwaps.js"
  - "src/weather/weatherField.js"
  - "src/world/weather.js"
  - "src/render/volumetricClouds.js"
  - "src/render/enhancedSky.js"
  - "src/render/windWisps.js"
  - "src/render/labGrass.js"
  - "src/weather/wind.js"
routes: []
tables: []
replacesBible:
  - "07-Rendering/Weather-Arc.md"
related:
  - "weather-arc-overview"
  - "biome-precipitation-air-and-phase"
  - "snowless-climates-yards-and-house-signs-overview"
  - "sky-weather-and-lighting"
invariants:
  - "`groundIsSnowy` (`src/world/climateSwaps.js`) is true in Winter for all non-Desert base climates (`getTerrainGroundArchive` adds `+1`), and `groundWearsSnow` also respects snowless terrain sets."
  - "`overGround(word, climateIndex, nowMinutes)` (`src/weather/weatherSim.js`) converts rain or thunder to snow over snow-covered ground and snow to rain over bare ground when `snowGroundLawOn()` holds."
  - "When `precipLawOn()` holds and `_set` receives coordinates, precipitation phase resolves from air temperature (`snowShareAt` and `phaseRound`), bypassing `overGround`."
  - "`\"sandstorm\"` is appended as the eighth `WEATHER_TYPES` entry without altering the seven classic enum ordinals or `WeatherTable.json` columns, spawning only as placed weather cells."
traps:
  - "The raw rolled word is kept (_raw, currentWeatherRaw) so a thunder word grounded to snow still drives storm-grade wind violence; reading currentWeather() for violence turns blizzards into flurries."
  - "Volumetric cloud cells are capped by QUALITY.*.cells: 3 on lo, 8 on default and hi (MAX_CELLS = 8 shader arrays)."
dfu:
  - "Assets/Scripts/Game/WeatherManager.cs"
tags:
  - "snow-ground"
  - "cloud-cells"
  - "sandstorm"
  - "climate"
  - "enhanced-lane"
---

# No Rain Over Snow, Cloud Cells by Place, and the Sandstorm

`src/weather/weatherSim.js` and `src/world/climateSwaps.js` align falling precipitation with ground snow cover while preserving raw storm intensity, and `src/weather/weatherField.js` places spatial cloud and sandstorm cells across the terrain.

- **Ground snow alignment (`src/world/climateSwaps.js`, `src/weather/weatherSim.js`, `src/weather/wind.js`):** `groundIsSnowy` holds in winter for all non-desert base climates (`getTerrainGroundArchive` adds `+1`), and `groundWearsSnow` also honors snowless terrain sets. When `snowGroundLawOn()` holds, `overGround(word, climateIndex, nowMinutes)` converts rain or thunder to snow over snow-covered ground and snow to rain over bare ground, though `precipLawOn()` with known coordinates resolves phase from air temperature (`snowShareAt` and `phaseRound`) instead. `_set` retains the rolled word in `_raw` (`currentWeatherRaw`) so thunder grounded into snow keeps blizzard wind violence.
- **Placed cells and sandstorms (`src/weather/weatherField.js`, `src/world/weather.js`, `src/render/volumetricClouds.js`, `src/render/enhancedSky.js`, `src/render/windWisps.js`, `src/render/labGrass.js`):** `CELL_WORDS` places drifting cells (`CELL_JITTER = 0.35`, `DRIFT_M_PER_MIN = 15`) for rain (`24000` m spacing, `9` to `16` km radius), thunder (`22000` m, `3.5` to `7.5` km), snow (`26000` m, `10` to `18` km), and sandstorm (`30000` m, `8` to `14` km), capped by `QUALITY.*.cells` (`3` on `lo`, `8` on `default` and `hi`, `MAX_CELLS = 8`) and testable via `?cloudcell=<weather>[,<ahead>[,<radius>]]` (`parseCloudCellDoor`, defaulting to `6000` m east and `3000` m radius). Appended as the eighth `WEATHER_TYPES` entry, `"sandstorm"` spawns over `sandCountry` when `SAND_FROM` matches `['cloudy', 'thunder']`, driving `FOG_SETTINGS.sandstorm` (`0.09`), sun scale `0.35`, `WEATHER_SKY.sandstorm` cover `0.90`, `VC_PROFILE.sandstorm` (`0` to `900`), `CELL_TINT` sand, wind violence `0.95`, `LAB_DIM.sandstorm` (`0.55`), and `SAND_LOOK` (`7000` particles in the wisp program).
