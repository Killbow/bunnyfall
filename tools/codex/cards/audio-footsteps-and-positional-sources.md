---
slug: audio-footsteps-and-positional-sources
title: "Footstep Stride, Torches, Animals, and Dungeon Ambience"
domain: audio
kind: subcard
parent: audio-arc-overview
files:
  - src/audio/footsteps.js
  - src/audio/soundClips.js
  - src/audio/animalAmbience.js
  - src/audio/ambientEffects.js
  - src/scenes/dungeonContext.js
  - src/ui/videoPlayer.js
  - src/ui/loadClassicWindow.js
  - src/audio/immersiveFootsteps.js
  - src/net/remotePlayers.js
routes: []
tables: []
replacesBible:
  - "08-Audio/Audio.md"
related:
  - audio-arc-overview
  - body-motion-gait-and-footfall
  - sky-weather-and-lighting
invariants:
  - "WALK_STEP_INTERVAL = 2.5 units for walking and running alike. Clips alternate at FOOTSTEP_VOLUME 0.7, halved when halfSpeed (IsMovingLessThanHalfSpeed)."
  - "lastPosition is written only on the lost-grounding landing reset and after accumulation. Levitation, mount, and airborne early returns leave the anchor stale, so a step fires on the first open frame."
  - "The first landing after load or entry is swallowed (ignoreLostGrounding = true in the constructor)."
  - "Dungeon shallow water is latched when (`centreY` - 0.57) < surface, where centreY is the live capsule center."
  - "`src/audio/immersiveFootsteps.js` keeps three Immersive Footsteps mod quirks on purpose: `altStep` is never true, so the Alt tables go unused; the chain and plate sway branches re-roll the leather interval instead of their own; and the swim step ignores `AllowFootstepSounds`."
traps:
  - "Rebasing the anchor in early returns suppresses the step DFU plays on dismount, on landing out of levitation, and on falling into water."
  - "Exterior torches are silent. Only dungeon TORCH_ARCHIVE 210 records {0,1,6,16,17,18,19,20} loop Burning (420)."
  - "Peers send the `FOOTSTEP_KIND` value as the pose field `fk` (`src/net/wire.js`, `0` to `5`) and look the clip pair up in `FOOTSTEP_CLIP_SETS` on their own side (`src/net/remotePlayers.js`), so those values and that table order are wire data."
dfu:
  - Assets/Scripts/Game/PlayerFootsteps.cs
  - Assets/Scripts/Game/AmbientEffectsPlayer.cs
tags:
  - footsteps
  - torches
  - animals
  - ambience
  - video-mute
---

# Footstep Stride, Torches, Animals, and Dungeon Ambience

Positional and stride-driven audio modules mirror Daggerfall Unity's footfall anchor, dungeon torch emitters, animal barks, and ambient one-shot presets.

- **Footstep stride and water latching (`src/audio/footsteps.js`, `src/scenes/dungeonContext.js`):** Walking and running both advance against `WALK_STEP_INTERVAL = 2.5` units, alternating step clips at `FOOTSTEP_VOLUME = 0.7` (halved under `halfSpeed`). `lastPosition` updates only on a lost-grounding landing reset and after distance accumulation; early returns during levitation, mounting, or airborne frames leave the anchor untouched so dismounting or landing fires an immediate step, while `ignoreLostGrounding = true` swallows the initial spawn landing. Dungeon shallow-water footsteps latch whenever `(`centreY` - 0.57) < surface`, where `centreY` is the live capsule center.
- **Torches, animals, and ambient presets (`src/audio/ambientEffects.js`, `src/audio/animalAmbience.js`, `src/audio/soundClips.js`):** Exterior torches stay silent; only dungeon `TORCH_ARCHIVE` `210` records `{0, 1, 6, 16, 17, 18, 19, 20}` start `loop3d(SOUND.Burning, pos, 0.7, { maxDistance: 5 })` (`Burning` is clip `420`, linear falloff) while the player is within `TORCH_MAX_DISTANCE = 5`. In archive `201`, `ANIMAL_SOUND_BY_RECORD` maps horses (`0/1`), cows (`3/4`), pigs (`5/6`), cats (`7/8`), and dogs (`9/10`), rolling `DFRandom.rand() <= 100` (`AMBIENT_RANDOM_PLAY_MAX`) each 16 Hz tick within `ANIMAL_MAX_DISTANCE = 19.2` (`768 * 0.025`). Dungeon ambient one-shots use clips `63-76`, and `presetForExterior(weather, night, desolate)` selects outdoor presets.
- **UI and video integration (`src/ui/videoPlayer.js`, `src/ui/loadClassicWindow.js`):** `muteAmbientForVideo` and `unmuteAmbientForVideo` toggle `setMuted` on active ambients, and double-clicking a classic save slot fires `ButtonClick` twice.
