---
slug: "indoor-rain-gain-hrtf-and-peer-clop"
title: "Indoor Rain Gain, HRTF Listener Z-Flip, and Peer Horse Clop"
domain: "audio"
kind: "subcard"
parent: "shared-quest-relink-and-slope-foot-rest-overview"
files:
  - "src/audio/audio.js"
  - "src/audio/ambientEffects.js"
  - "src/audio/betterAmbience.js"
  - "src/audio/music.js"
  - "src/audio/songPlayer.js"
  - "src/weather/weatherSim.js"
  - "src/weather/distantStorms.js"
  - "src/scenes/frame/indoorsFrame.js"
  - "src/net/remotePlayers.js"
  - "src/net/onlineWorld.js"
  - "src/travel/riding.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-23.md"
related:
  - "shared-quest-relink-and-slope-foot-rest-overview"
  - "audio-footsteps-and-positional-sources"
  - "audio-music-fades-and-generated-scores"
  - "audio-arc-overview"
invariants:
  - "Indoor rain plays at street rain times `INDOOR_RAIN_GAIN = 0.35` (`src/audio/ambientEffects.js`), dropping to `0` while Better Ambience indoor rain is active."
  - "Indoor ambience reads `weatherSim.heardWeather()` and `heardRainGain` rather than raw simulation state, and Better Ambience matches street rain by RMS (`AudioEngine.clipLevel`)."
  - "`audioFrame` and `placeAudio` negate `z` for both listener and sources to map left-handed scene coordinates into WebAudio `PANNING_MODEL = 'HRTF'` space."
traps:
  - "Crickets stop at building doors and dungeon entrances; `INDOOR_CRICKETS_GAIN` is retired and must not be reintroduced."
  - "A riding peer pose carries `hs` only while mounted and moving; poses older than `PEER_RIDE_STALE_MS = 1000` stop rider motion."
dfu: []
tags:
  - "audio"
  - "rain"
  - "crickets"
  - "hrtf"
  - "riding"
  - "music"
---

# Indoor Rain Gain, HRTF Listener Z-Flip, and Peer Horse Clop

In `src/audio/ambientEffects.js`, `src/audio/betterAmbience.js`, `src/weather/weatherSim.js`, and `src/scenes/frame/indoorsFrame.js`, indoor rain plays at street rain volume multiplied by `INDOOR_RAIN_GAIN = 0.35`, dropping to `0` whenever Better Ambience indoor rain is active. Indoor ambience reads `weatherSim.heardWeather()` and `heardRainGain` rather than raw simulation state, while Better Ambience matches street rain level by RMS (`AudioEngine.clipLevel`). Crickets stop at building doors and dungeon entrances, and retired `INDOOR_CRICKETS_GAIN` must not be reintroduced.

In `src/audio/audio.js`, `audioFrame` and `placeAudio` negate `z` for both the listener and positional sources, mapping left-handed scene coordinates into right-handed WebAudio `PANNING_MODEL = 'HRTF'` space. In `src/audio/music.js` and `src/audio/songPlayer.js`, track transitions crossfade through `rampFader` (`MUSIC_FADE_OUT_S = 1.5`, `MUSIC_FADE_IN_S = 1.0`). In `src/weather/distantStorms.js`, distant thunder uses `THUNDER_SOURCE_M = 13` and suppresses lightning over snow.

Across `src/net/remotePlayers.js`, `src/net/onlineWorld.js`, and `src/travel/riding.js`, a riding peer pose carries `hs` only while the peer is mounted and moving. Peer hoofbeats alternate `HorseClop` and `HorseClop2` on `hs` at half volume, and poses older than `PEER_RIDE_STALE_MS = 1000` stop rider motion.
