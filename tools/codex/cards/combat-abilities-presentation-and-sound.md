---
slug: "combat-abilities-presentation-and-sound"
title: "Combat Abilities: Signature Swings, Synthesized Sound, and the Anchor Lantern"
domain: "combat"
kind: "subcard"
parent: "combat-abilities-overview"
files:
  - "src/combat/abilities/strikeMotion.js"
  - "src/combat/abilities/abilityArt.js"
  - "src/audio/abilitySfx.js"
  - "src/render/abilityParticles.js"
  - "src/render/spellImpactFx.js"
  - "src/combat/abilities/wayfarerLantern.js"
  - "src/render/wayfarerLanternFx.js"
  - "src/combat/abilities/utility.js"
routes: []
tables: []
related:
  - "combat-abilities-overview"
  - "weapon-widget-motion-modules-and-rect"
invariants:
  - "strikeMotionPath picks a weapon-sprite path from the ability art's form (its finish form on a final hit), with a stable size and lean for each ability from a hash of its ID. It only moves the sprite while a strike plays."
  - "abilitySfx.js makes every sound with Web Audio oscillators and noise through the game's sound volume bus; it ships no sound files and is silent without a running AudioContext or with Enhanced Sounds off."
  - "The Wayfarer lantern belongs to the scene the mark was set in (the player door object) and the exact anchor record; Recall consumes the anchor and puts it out. offsetWayfarerLantern moves it with that scene's floating origin."
traps:
  - "The fx engine blends additively, so the lantern's cage is drawn as lit brass, not dark iron."
  - "MIN_GAP_S keeps a sweep through several enemies to one impact sound."
tags:
  - "abilities"
  - "animation"
  - "sound"
  - "lantern"
---

# Combat Abilities: Signature Swings, Synthesized Sound, and the Anchor Lantern

**Swings.** `strikeMotion.js` maps each art form (crescent, helix, cross, vault, claw, and others) to a short keyframed path of screen offset and scale. `rig.js` stores it on `blow.motion.path`; `strikePose` follows it instead of the plain swing pose. Paths stay small, with no spins or large flourishes. The particle trails stay in `abilityParticles.js`.

**Sound.** `abilitySfx.js` voices each art material, such as steel rings, stone thuds, and shadow whispers, and shapes each moment: a wind-up swell, a release whoosh, an impact accent, a self chime, and a landing thump. `rig.js` and `utility.js` call `playAbilitySfx`, beside the clips the rig already plays.

**Lantern.** Wayfarer's Anchor Mark calls `placeWayfarerLantern`. `stepWayfarerLantern` emits the `wayfarer-lantern` fx recipe (`wayfarerLanternFx.js`, drawn by `spellImpactFx.js`) every `LANTERN_BEAT_S` while the player is within `LANTERN_SEEN_M` in the same scene.
