---
slug: super-dungeon-look-arena-and-remnant-rig
title: "Abyss Dungeon Look: Last Moment Arena Glow and Brass Remnant Rig"
domain: multiplayer
kind: subcard
parent: super-dungeon-look-overview
files:
  - src/render/sdArenaGlow.js
  - src/render/sdPillarPass.js
  - src/world/sdPillarModel.js
  - src/world/sdRemnantModel.js
  - src/world/sdRemnantArt.js
  - src/worldEvents/sdRemnantRig.js
  - src/worldEvents/sdRemnantBlows.js
  - src/worldEvents/sdArenaRead.js
  - src/worldEvents/sdArenaWatch.js
  - src/net/sdBrain.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons-Look.md"
related:
  - super-dungeon-look-overview
  - brass-remnant-fight-and-rewards
  - feud-telegraphs-and-revenants
invariants:
  - "The Last Moment arena floor displays fight state directly through floor fissures and rim numerals rather than adding a separate overlay telegraph; `sdArenaGlowAt` (`src/render/sdArenaGlow.js`) is a pure function of the fight link state and clock."
  - "Unlit arena floor geometry remains at or below `SD_LADDER.structure` (`0.25`), while only the fissure flood and twelve rim numerals rise to signal luminance."
  - "During the Reset countdown, rim numerals light sequentially in soul-white with the final two in ember, landing the blow when `XII` lights; at the end of the Hour, every fissure and numeral turns red."
traps:
  - "`SD_ARENA` (`{ x: 0, z: 246, r: 26 }`) is owned by `src/net/sdBrain.js`; render and scene modules must import it rather than duplicating its coordinates."
dfu: []
tags:
  - super-dungeons
  - brass-remnant
  - arena
  - boss
  - telegraph
  - rig
---

The Last Moment arena (`src/render/sdArenaGlow.js`, `src/worldEvents/sdArenaRead.js`, and `src/worldEvents/sdArenaWatch.js`) and the Brass Remnant articulated rig (`src/worldEvents/sdRemnantRig.js` and `src/worldEvents/sdRemnantBlows.js`) present boss mechanics through floor signals and mechanical posture.

## Arena Floor Fissures, Numerals, and Pillars

Centered at `SD_ARENA` (`{ x: 0, z: 246, r: 26 }` from `src/net/sdBrain.js`), the arena floor stays within `SD_LADDER.structure` (`0.25`). Eight radial fissures (`SD_FISSURES`) are baked once into a `256` `R8` distance field texture. `sdArenaGlowAt` computes each frame's emissive state purely from fight state and time: each Mantella pulse floods the fissures green outward over `SD_FLOOD.front_s` and fades over `SD_FLOOD.fade_s`.

Twelve rim numerals share the sky glyph shader (`SD_NUMERAL_GLSL`) for positional raid callouts. During a Reset count, numerals light from `I` to `XII` in soul-white with `XI` and `XII` in ember, triggering the strike on `XII`; when the Hour expires, all fissures and numerals turn red. Arena pillars are built by `src/world/sdPillarModel.js` and rendered by `src/render/sdPillarPass.js`.

## Brass Remnant Rig and Attack Tells

`src/world/sdRemnantModel.js` and `src/world/sdRemnantArt.js` build the seven articulated parts in `SD_REMNANT_PARTS` (`pelvis`, `legR`, `legL`, `torso`, `head`, `armR`, and `armL`). `src/worldEvents/sdRemnantRig.js` positions `SD_RIG_JOINTS` and `SD_REM_HAND` (with the right hand on `+x`), spins internal gears via `sdGearsAt(s, t)`, and drives states such as `volleyGather`. Attack and elemental tells (`src/worldEvents/sdRemnantBlows.js`) use `SD_BLOW_COLOR`, `SD_ELEMENT_COLOR`, and `TELEGRAPH_STYLE` (`weight`, `fire`, `frost`, `shock`, `poison`, and `dagon`).
