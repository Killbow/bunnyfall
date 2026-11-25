---
slug: "weather-arc-overview"
title: "Weather Arc: The World Weather Map and Its Consumers"
domain: "rendering"
kind: "overview"
parent: null
files:
  - "src/weather/weatherMap.js"
  - "src/weather/weatherSim.js"
  - "src/weather/weatherField.js"
  - "src/weather/weatherTable.js"
  - "src/world/weather.js"
  - "src/weather/wind.js"
  - "src/weather/distantStorms.js"
  - "src/render/volumetricClouds.js"
  - "src/scenes/shared.js"
routes: []
tables: []
replacesBible:
  - "07-Rendering/Weather-Arc.md"
related:
  - "weather-arc-map-systems-and-crossings"
  - "weather-arc-ground-law-and-sandstorm"
  - "weather-arc-distant-storms-and-lightning"
  - "sky-weather-and-lighting"
  - "biome-precipitation-overview"
invariants:
  - "weatherAt(x, z, minutes, climateAt) in src/weather/weatherMap.js is pure: the same world coordinates and game minute give the same weather online and offline."
  - "Every consumer (sim word, sky cells, wind approach, distant storms, survival wetness) reads one map of weather systems; none rolls its own weather."
  - "The classic lane preserves upstream `WeatherTable` odds and per-climate rolls verbatim, while the weather map, field, and snow-ground laws run behind the enhanced lane and Enhanced Environments."
traps:
  - "Query doors are URL parameters read once lazily: ?wxmap=off falls back to the WEATHER2b field (src/weather/weatherField.js), ?wxfield=off to the zone word, ?snowground=off disables the ground law, ?weather=<word> pins a word whole."
  - "The Slice E travel-map weather layer (ui/weatherLayer.js) was removed by DISC17-C; do not reintroduce map-layer constants or glyph code."
dfu:
  - "Assets/Scripts/Game/WeatherManager.cs"
tags:
  - "weather"
  - "weather-map"
  - "enhanced-lane"
  - "query-doors"
---

# Weather Arc: The World Weather Map and Its Consumers

On the enhanced lane with Enhanced Environments enabled, weather is modeled as spatial weather systems across the land (`SYSTEM_TYPES` and `birthsIn` in `src/weather/weatherMap.js`), born through a Poisson process on a space-time lattice per type (thunderstorms, rain fronts, snow, sandstorm, fog, overcast, and cloudy). The classic lane preserves upstream `WeatherTable` (`src/weather/weatherTable.js`) odds and per-climate rolls verbatim.

- **Pure map law and single consumer seam (`src/weather/weatherMap.js`, `src/weather/weatherSim.js`, `src/scenes/shared.js`):** `weatherAt(x, z, minutes, climateAt)` is a pure function returning identical weather online and offline for the same world coordinates and game minute. Every consumer (simulation word, volumetric sky cells, wind approach in `src/weather/wind.js`, distant storms in `src/weather/distantStorms.js`, and survival wetness) reads this single map. `sampleWeatherField` and map sampling write the simulation word through `_set` in `src/weather/weatherSim.js`, keeping the rolled word in `currentWeatherRaw()` for wind violence.
- **Definitions and query doors (`src/world/weather.js`, `src/render/volumetricClouds.js`, `src/weather/weatherField.js`):** `src/world/weather.js` defines `WEATHER_TYPES` (seven classic entries plus `"sandstorm"`) and `FOG_SETTINGS`, `src/render/enhancedSky.js` defines `WEATHER_SKY`, and `src/render/volumetricClouds.js` defines `VC_PROFILE` and `QUALITY`. Lazy URL query doors (`?wxmap=off`, `?wxfield=off`, `?snowground=off`, and `?weather=<word>`) and test overrides (`setWeatherMapLaw`, `setWeatherFieldLaw`, and `setSnowGroundLaw`, accepting `null` to reset) switch active laws.
