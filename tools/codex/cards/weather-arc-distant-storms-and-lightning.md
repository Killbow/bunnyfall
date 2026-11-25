---
slug: "weather-arc-distant-storms-and-lightning"
title: "Distant Storms, Lightning Bolts, and Fall Clock Hygiene"
domain: "rendering"
kind: "subcard"
parent: "weather-arc-overview"
files:
  - "src/weather/distantStorms.js"
  - "src/weather/lightning.js"
  - "src/render/lightningBolts.js"
  - "src/audio/audio.js"
  - "src/render/precipitation.js"
  - "src/render/rainCurtains.js"
  - "src/scenes/frame/airFrame.js"
  - "src/systems/survival/env.js"
routes: []
tables: []
replacesBible:
  - "07-Rendering/Weather-Arc.md"
related:
  - "weather-arc-overview"
  - "weather-arc-map-systems-and-crossings"
  - "indoor-rain-gain-hrtf-and-peer-clop"
  - "audio-arc-overview"
invariants:
  - "Distant lightning strikes (`src/weather/distantStorms.js`) follow a Poisson process at `STRIKES_PER_MINUTE = 0.15` scaled by storm envelope, delaying thunder by `distance / SPEED_OF_SOUND` (`343` m/s) inside `THUNDER_AUDIBLE_M = 25000` m."
  - "Strikes land strictly inside the parent front clip (`insideClip`) and skip ground where the map law resolves snow (`mapGround`)."
  - "Thunder delayed past `THUNDER_LATE_SECONDS = 1` across paused or suspended frames drops instead of playing late, and `play3d(..., { far })` preserves listener offset across origin recenters."
traps:
  - "WebAudio loops must disconnect gain, panner and filter nodes on stop through releaseNodes (src/audio/audio.js) or dead chains pile up on the bus (RAIN-LEAK)."
  - "PrecipitationRenderer re-origins its GPU clock after PRECIP_REST_S = 10 s off screen, on a backwards clock, or at PRECIP_CLOCK_MAX_S = 3600 s; float precision drifts otherwise."
  - "drawFalling in src/scenes/frame/airFrame.js fills one reusable wxEye32 Float32Array per frame; never allocate per draw."
dfu:
  - "Assets/Scripts/Game/WeatherManager.cs"
tags:
  - "lightning"
  - "thunder"
  - "distant-storms"
  - "audio"
  - "precipitation"
---

# Distant Storms, Lightning Bolts, and Fall Clock Hygiene

`src/weather/distantStorms.js`, `src/weather/lightning.js`, and `src/render/lightningBolts.js` pair Poisson lightning strikes with acoustic propagation and GPU precipitation clock hygiene.

- **Lightning geometry and acoustic delay (`src/weather/distantStorms.js`, `src/weather/lightning.js`, `src/render/lightningBolts.js`, `src/audio/audio.js`):** Storm cells fire Poisson strikes at `STRIKES_PER_MINUTE = 0.15` scaled by storm envelope, landing strictly inside the parent front (`insideClip`) and skipping ground where `mapGround` resolves snow. `src/weather/lightning.js` generates stepped leaders with `CG_SHARE = 0.3` (the remainder in-cloud), `LEADER_STEP_M = 30`, `BOLT_LIFE_S = 1.0` (`BOLT_SECONDS`), and a point light of `FLASH_REACH_M = 3500` offset `FLASH_TOWARD_M = 300` toward the strike and `FLASH_UP_M = 250` upward (`?bolttest=<meters>` injects a test bolt into `stormLights.frame`). `src/render/lightningBolts.js` renders camera-facing ribbons clamped to `BOLT_MIN_PX = 1.4` px up to `BOLT_SEEN_M = 45000` m at `BOLT_HEIGHT` (the thunder `VC_PROFILE` mid-height). Thunder delays by `distance / SPEED_OF_SOUND` (`343` m/s) within `THUNDER_AUDIBLE_M = 25000` m at `THUNDER_SOURCE_M = 13`, drops if delayed past `THUNDER_LATE_SECONDS = 1`, keeps listener offset via `play3d(..., { far })`, and disconnects stopped WebAudio loops via `releaseNodes`.
- **Precipitation hygiene and wetness (`src/render/precipitation.js`, `src/render/rainCurtains.js`, `src/scenes/frame/airFrame.js`, `src/systems/survival/env.js`):** `PrecipitationRenderer` resets its GPU clock after `PRECIP_REST_S = 10` s idle, on backward clocks, or at `PRECIP_CLOCK_MAX_S = 3600` s. `drawFalling` reuses one `wxEye32` `Float32Array` per frame, and survival wetness in `src/systems/survival/env.js` reads `fallingWeather()`.
