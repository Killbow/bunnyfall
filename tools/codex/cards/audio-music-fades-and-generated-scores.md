---
slug: audio-music-fades-and-generated-scores
title: "Music Fades, HMI Clock, Live Volume, and Generated Scores"
domain: audio
kind: subcard
parent: audio-arc-overview
files:
  - src/audio/music.js
  - src/audio/songPlayer.js
  - src/formats/hmiFile.js
  - src/audio/midiOut.js
  - src/audio/soundscape/seaScore.js
  - src/worldEvents/gateScore.js
  - src/worldEvents/sdScore.js
  - src/systems/eliteGates/egScore.js
  - src/world/gateBoss.js
  - src/audio/introScore.js
routes: []
tables: []
replacesBible:
  - "08-Audio/Audio.md"
related:
  - audio-arc-overview
  - audio-midi-and-soundscape
invariants:
  - "HMI_TICKS_PER_QUARTER = 60, so one tick is 1/BPM s. The header's 480 resolution field is not the time base."
  - "Any delta over HMI_MAX_DELTA (0xFFFF) is shunted onto the track's last event tick (SUNNYDAY.HMI track 5)."
  - "A switch fades out over MUSIC_FADE_OUT_S 1.5 s, then the next song fades in over MUSIC_FADE_IN_S 1.0 s (DISC20-B)."
  - "A Controls/MusicVolume write calls resyncGain through onSettingChange, which ramps the master gain over 0.05 s mid-song."
traps:
  - "Reading the HMI header resolution as ticks per quarter runs every song 8x fast."
  - "Sea scores hold at least SEA_SCORE_HOLD_MS 90 s and change only after SEA_SCORE_SETTLE_MS 20 s of a new want. A fight or storm cuts in at once. A finished fight keeps its song for SEA_FIGHT_TAIL_MS 20 s."
dfu:
  - Assets/Scripts/Internal/DaggerfallSongPlayer.cs
tags:
  - music
  - hmi
  - crossfade
  - midi-out
  - sea-score
  - boss-score
---

# Music Fades, HMI Clock, Live Volume, and Generated Scores

The music stack parses HMI tracks against a fixed 60-tick quarter-note clock, crossfades between songs, updates volume live, and drives procedural sea, intro, and world-event scores.

- **HMI timing and sanitizing (`src/formats/hmiFile.js`, `src/audio/songPlayer.js`):** HMI songs run at `HMI_TICKS_PER_QUARTER = 60` (one tick equals `1 / BPM` seconds) rather than the header's `480` resolution field, which would play songs 8x fast. Any variable-length delta above `HMI_MAX_DELTA` (`0xFFFF`, such as `SUNNYDAY.HMI` track 5) is clamped to the track's final event tick. Playback uses `MUSIC_GAIN = 0.22` and `SONG_FLOOR_HZ = 30`.
- **Fades, live volume, and MIDI output (`src/audio/music.js`, `src/audio/midiOut.js`):** Track changes fade out over `MUSIC_FADE_OUT_S = 1.5` s before fading the next song in over `MUSIC_FADE_IN_S = 1.0` s (`DISC20-B`). Updating `Controls/MusicVolume` triggers `resyncGain` via `onSettingChange` for a `0.05` s master gain ramp, `MusicService.setMuted(v, reason = 'video')` suspends gain without dropping the active song, and `MIDI-OUT1` forwards events to a selected `MIDIOutput`.
- **Sea hysteresis and generated scores (`src/audio/soundscape/seaScore.js`, `src/audio/introScore.js`, `src/worldEvents/gateScore.js`, `src/worldEvents/sdScore.js`, `src/systems/eliteGates/egScore.js`, `src/world/gateBoss.js`):** `seaScoreFor(ctx)` picks from `SEA_SONGS` (`SEACALM`, `SEAOPEN`, `SEASTORM`, `SEANIGHT`, `SEAPORT`, and `SEAFIGHT` with `SEA_CALM_WAY = 2.5`), holding tracks for `SEA_SCORE_HOLD_MS = 90` s and requiring `SEA_SCORE_SETTLE_MS = 20` s before switching except when a storm or fight interrupts immediately (holding combat music for `SEA_FIGHT_TAIL_MS = 20` s after battle). Procedural generators supply `courtScoreFor` and `SCORE_PRESS`, `HOUR_PRESS`, `SPIRE_VOICES` and `SPIRE_KIT`, `BOSS_CUES`, and `INTRO_PRESS`, `INTRO_VOICES`, and `INTRO_KIT`.
