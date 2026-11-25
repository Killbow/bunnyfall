---
slug: audio-voice-cap-and-master-limiter
title: "Voice Cap, Flat-Voice Priority, and the Master Limiter"
domain: audio
kind: subcard
parent: audio-arc-overview
files:
  - src/audio/audio.js
  - src/net/remotePlayers.js
  - src/net/peerGather.js
  - src/professions/gatherSounds.js
  - src/combat/hostCombat.js
routes: []
tables: []
replacesBible:
  - "08-Audio/Audio.md"
related:
  - audio-arc-overview
  - audio-midi-and-soundscape
invariants:
  - "voiceRoom(live, level, max = REAL_VOICES, flat): below max, a shot plays. At max, a flat shot always plays and steals the quietest positional voice (the quietest flat voice only when every voice is flat). A positional shot plays only if level >= the quietest positional voice, which it steals. It never steals a flat voice."
  - "A stolen voice fades over VOICE_FADE_S = 0.08 s instead of popping."
  - "LIMITER = { threshold: -3, knee: 0, ratio: 20, attack: 0.001, release: 0.12 }. limitAmplitude is linear up to LIMIT_LINEAR 0.75 and bends toward LIMIT_CEILING 0.98, over LIMIT_RANGE 4 times full scale. limiterTrim removes the compressor's make-up gain, so the stage is unity below threshold."
traps:
  - "A peer swing inside PEER_SOUND_PROFILE (refDistance 6, maxDistance 30, linear) reaches the ear at 1.1, louder than the player's own hit (1), cry (1), or steps (0.7). Without flat priority, 32 peer swings refused every local sound."
  - "Finished one-shot chains must be released (releaseNodes), or dead nodes pile up on the bus."
dfu: []
tags:
  - voice-cap
  - limiter
  - gate-mix
  - peer-audio
  - gathering
---

# Voice Cap, Flat-Voice Priority, and the Master Limiter

`src/audio/audio.js` bounds concurrent one-shots at `REAL_VOICES = 32` (matching Unity `m_RealVoiceCount`) and protects local non-positional cues from nearby peer traffic before passing the mixed signal through the master limiter.

- **Voice admission and stealing (`src/audio/audio.js`, `src/net/remotePlayers.js`):** `voiceRoom(live, level, max = REAL_VOICES, flat)` admits any shot when active voices are below `max`. At capacity, a flat shot always plays by stealing the quietest positional voice, or the quietest flat voice only when all active voices are flat. A positional shot ranks its gain via `distanceGain(d, opts)` (Web Audio linear, inverse, or exponential models) and plays only if `level` meets or exceeds the quietest positional voice, never stealing a flat voice. Because a peer swing inside `PEER_SOUND_PROFILE` (`refDistance: 6`, `maxDistance: 30`, linear) arrives at volume `1.1`, flat priority prevents 32 peer swings from starving local hits (`1`), cries (`1`), or footsteps (`0.7`). Stolen voices ramp down over `VOICE_FADE_S = 0.08` s, and completed chains disconnect via `releaseNodes`.
- **Combat and gathering cues (`src/combat/hostCombat.js`, `src/professions/gatherSounds.js`, `src/net/peerGather.js`):** Parries play at `PARRY_VOLUME = 1.1` while enemy whiffs use `1.0`. `GATHER_SFX` indexes 36 synthesized clips (`public/sfx/gather-*.wav`), and `PEER_BLOW_DELAY_S` aligns peer chop or mine impacts to `swingS * MELEE_HIT_SHARE`.
- **Master limiter (`src/audio/audio.js`):** `LIMITER` (`threshold: -3`, `knee: 0`, `ratio: 20`, `attack: 0.001`, `release: 0.12`) feeds `limitAmplitude` (linear to `LIMIT_LINEAR = 0.75`, bending to `LIMIT_CEILING = 0.98` across `LIMIT_RANGE = 4`), while `limiterTrim` cancels compressor make-up gain for unity response below threshold.
