---
slug: audio-arc-overview
title: "Audio Arc: Voices, Footsteps, Positional Sources, and Scores"
domain: audio
kind: overview
parent: null
files:
  - src/audio/audio.js
  - src/audio/soundClips.js
  - src/audio/footsteps.js
  - src/audio/ambientEffects.js
  - src/audio/music.js
  - src/audio/songPlayer.js
  - src/formats/hmiFile.js
  - src/audio/soundscape/seaScore.js
routes: []
tables: []
replacesBible:
  - "08-Audio/Audio.md"
related:
  - audio-midi-and-soundscape
  - audio-voice-cap-and-master-limiter
  - audio-footsteps-and-positional-sources
  - audio-music-fades-and-generated-scores
  - sky-weather-and-lighting
invariants:
  - "Every bus passes through one limiter stage (DynamicsCompressorNode then WaveShaper) before ctx.destination, so nothing reaches the speakers past LIMIT_CEILING."
  - "One-shots are bounded by REAL_VOICES (32). Loops and named beds are not counted."
  - "Music switches fade out over MUSIC_FADE_OUT_S and fade in over MUSIC_FADE_IN_S. They never cut."
traps:
  - "Treating DFU call chains (ActionSystem, PlayerFootsteps, AmbientEffectsPlayer) as network routes. The audio arc is client-only and has no HTTP route, WebSocket frame, or SQLite table."
dfu:
  - Assets/Scripts/Game/PlayerFootsteps.cs
  - Assets/Scripts/Game/AmbientEffectsPlayer.cs
tags:
  - audio
  - webaudio
  - voice-cap
  - limiter
  - footsteps
  - music
---

# Audio Arc: Voices, Footsteps, Positional Sources, and Scores

The audio arc layers runtime mixing, voice budgets, positional emitters, and procedural scores over the core WebAudio synth, reverb, and HRTF decoding pipeline (`audio-midi-and-soundscape`). Every subsystem runs locally in the client without HTTP routes, WebSocket frames, or SQLite tables.

- **Master limiter and voice cap (`src/audio/audio.js`, `src/audio/soundClips.js`):** All output buses feed a shared limiter stage (`DynamicsCompressorNode` followed by a `WaveShaper`) ahead of `ctx.destination` (`GATE-MIX`), clamping peaks below `LIMIT_CEILING`. One-shot playback is capped at `REAL_VOICES` (`32`, `VOICE-CAP`), while looping emitters and named soundscape beds bypass the one-shot counter. `SOUND` maps symbolic clip names to numeric indices (such as `Burning: 420`).
- **Footsteps and positional sources (`src/audio/footsteps.js`, `src/audio/ambientEffects.js`):** Footfall stride tracking, proximity-gated dungeon torch loops, exterior animal calls, and ambient one-shots drive spatial cues across interior, dungeon, and exterior scenes.
- **Music crossfades and generated scores (`src/audio/music.js`, `src/audio/songPlayer.js`, `src/formats/hmiFile.js`, `src/audio/soundscape/seaScore.js`):** Track transitions fade out over `MUSIC_FADE_OUT_S` and fade in over `MUSIC_FADE_IN_S` (`DISC20-B`) without hard cuts or enter/exit transition stingers. The music service coordinates HMI playback, external `MIDI-OUT1` device routing, `FIELD-WIND1` and `SOUNDSCAPE` procedural beds, `DECK-QUIET`, `INTRO-REVERT`, sea playlists, and boss or gate scores.
