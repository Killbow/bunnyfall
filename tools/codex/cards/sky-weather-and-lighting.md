---
slug: sky-weather-and-lighting
title: Sky Modes, Weather Fronts, and Lighting
domain: rendering
kind: overview
files:
  - src/scenes/shared.js
  - src/render/skyRenderer.js
  - src/render/enhancedSky.js
  - src/render/dynamicSkiesRenderer.js
  - src/render/volumetricClouds.js
  - src/render/enhancedLighting.js
  - src/weather/wind.js
  - src/audio/ambientEffects.js
  - src/world/worldClock.js
invariants:
  - "src/scenes/shared.js eases weather transitions over WEATHER_EASE_MINUTES and exposes shared sky.wind() and sky.cloudShadow state for grass, trees, precipitation, and ground shadows."
  - "Dungeon and interior frames must explicitly clear Renderer moonlight and indirect light globals and set window emission modes so exterior night state cannot leak underground."
  - "src/audio/ambientEffects.js scales outdoor rain loops to INDOOR_RAIN_GAIN (0.35, or 0 under Better Ambience) and silences night crickets indoors."
traps:
  - "Classic SkyRenderer caches at most SKY_FILES_KEPT (2) SKY??.DAT panoramas at once, while loads and fast-travel jumps snap weather immediately without easing."
  - "Modal interior frames continue ticking AmbientEffects indoors, so forgetting indoor rain scaling and cricket silencing leaves exterior beds playing at full street gain."
  - "`exteriorAmbient` multiplies the day curve by the weather scale twice, as Daggerfall Unity does, so a storm noon is dim. The key sun light takes the scale once. Do not collapse the square."
dfu:
  - Assets/Scripts/Internal/DaggerfallSky.cs
  - Assets/Scripts/Game/WeatherManager.cs
  - Assets/Scripts/Game/AmbientEffectsPlayer.cs
tags:
  - sky
  - weather
  - clouds
  - lighting
  - wind
---

# Sky Modes, Weather Fronts, and Lighting

`src/scenes/shared.js` coordinates exterior skies, weather fronts, wind vectors, and scene lighting across Classic `SkyRenderer` (`SKY??.DAT` panoramas capped at `SKY_FILES_KEPT = 2` plus `NITE??I0.IMG` stars, with gradient fallback), procedural `EnhancedSkyRenderer`, vendored `DynamicSkiesRenderer`, and raymarched `VolumetricClouds`.

- **Shared wind and light curves:** `src/scenes/shared.js` eases weather transitions over `WEATHER_EASE_MINUTES` and exposes `sky.wind()`, the `sky.cloudShadow` getter, `createWindModel` (`src/weather/wind.js`), and `setLightCurve` (`src/world/worldClock.js`). Grass, trees, windmills, precipitation, and ground cloud shadows read those shared values; loads and fast-travel jumps snap weather immediately.
- **Renderer lighting globals (`src/render/enhancedLighting.js`):** Moonlight, player indirect light, point-light caps, and window emission persist on `Renderer`. Dungeon and interior frames must explicitly clear moonlight and indirect light and set window emission (`'day'` in dungeons, dark in interiors) so exterior night state never leaks underground.
- **Indoor ambient silencing (`src/audio/ambientEffects.js`):** Modal frames continue ticking street `AmbientEffects` indoors, scaling building rain to `INDOOR_RAIN_GAIN` (`0.35`, or `0` under Better Ambience indoor rain) and silencing night crickets indoors.
