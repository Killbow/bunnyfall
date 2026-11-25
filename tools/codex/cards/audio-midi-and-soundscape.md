---
slug: audio-midi-and-soundscape
title: WebAudio Engine, MIDI Synth, and Soundscape
domain: audio
kind: overview
files:
  - src/audio/audio.js
  - src/formats/sndFile.js
  - src/formats/hmiFile.js
  - src/audio/songPlayer.js
  - src/audio/songManager.js
  - src/audio/gmSynth.js
  - src/audio/reverbPresets.js
  - src/audio/soundscape/soundscapeHost.js
invariants:
  - "audioFrame negates Z on listener and positional source coordinates to map left-handed scene space onto right-handed WebAudio HRTF panners."
  - "One-shot voices cap at REAL_VOICES (32), prioritizing local flat sounds over peer positional audio and disconnecting finished nodes via releaseNodes."
  - "Reverb impulse tails normalize to unit energy before scaling by millibel gain so long convolution presets never clip."
traps:
  - "Omitting stop() on src/audio/soundscape/soundscapeHost.js during modal interior or dungeon frames leaves outdoor surf and doorway beds playing indoors."
  - "Dividing decayTime by decayHFRatio instead of multiplying inverts high-frequency attenuation in two-band reverb tails."
dfu:
  - Assets/Scripts/API/SndFile.cs
  - Assets/Scripts/Internal/DaggerfallSongPlayer.cs
tags:
  - audio
  - webaudio
  - midi
  - synth
  - reverb
  - soundscape
---

# WebAudio Engine, MIDI Synth, and Soundscape

Audio modules (`src/audio/audio.js`, `src/systems/song/`, `src/audio/gmSynth.js`, `src/audio/reverbPresets.js`, and `src/audio/soundscape/soundscapeHost.js`) run sound effects, HMI/XMI music, convolution reverb, and outdoor soundscapes on WebAudio once the first user gesture resumes the `AudioContext`.

- **`DAGGER.SND` and voice cap (`src/audio/audio.js`, `src/formats/sndFile.js`):** Lazily decodes 11,025 Hz unsigned 8-bit PCM (`(b - 128) / 128`), negates Z in `audioFrame` for right-handed WebAudio HRTF panners, caps one-shots at `REAL_VOICES` (`32`, prioritizing local flat sounds over peer positional audio), and disconnects finished chains via `releaseNodes`.
- **HMI/XMI player and synth/bowed voices (`src/formats/hmiFile.js`, `src/audio/songPlayer.js`, `src/audio/gmSynth.js`):** Schedules 250 ms lookahead windows (`TICK_INTERVAL_MS = 100`) while folding channel state forward. Supports two-operator FM (`fmSpec`), GM percussion `35–87`, custom `songVoices` with sawtooth bowed strings (`saw`, velocity `cutoff`, bow `arc`, `sway`, `body` formants, and three-delay `ensemble`), and `muteReasons` (`src/audio/songManager.js` selects tracks).
- **Reverb presets (`src/audio/reverbPresets.js`):** Builds stereo `Cave`, `Stoneroom`, and `Quarry` impulses with unit-energy-normalized two-band tails (`decayTime * decayHFRatio`) to avoid convolution clipping.
- **Soundscape (`src/audio/soundscape/soundscapeHost.js`):** Drives surf, sea air, sea scores, wilderness air, and smithy/tavern doorway beds outdoors, calling `stop()` on modal interior or dungeon frames.
