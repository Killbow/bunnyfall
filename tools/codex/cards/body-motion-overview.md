---
slug: body-motion-overview
title: "Morrowind Body Motion: Third-Person Procedural Layer"
domain: characters
kind: overview
parent: null
files:
  - src/characters/bodyMotion/bodyMotion.js
  - src/characters/bodyMotion/bodyKit.js
  - src/combat/fpArm.js
  - src/formats/mwFirstPerson.js
  - src/mods/features.js
  - src/ui/settingsMap.js
  - src/net/peerBodies.js
  - src/player/motor.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Body-Motion.md"
  - "01-Overview/audits/Audit-Body-Motion.md"
related:
  - body-motion-gait-and-footfall
  - body-motion-weapon-carry-classes
  - body-motion-melee-blows-and-solver
  - characters-paperdoll-and-bodies
  - two-hands-morrowind-mirror-rig-and-spread
invariants:
  - "Each createFpArm rig owns one createBodyMotion instance (fpArm.js), stepped every frame with motionWord (fpArm.js) and laid on through poseAssembly's `motion` slot (src/formats/mwFirstPerson.js)."
  - "bodyKindOf(path) walks only base_anim skeletons: 'beast' for kna, 'female', or 'male'. Any wolf path or non-base_anim path returns null, and those bodies keep the clips."
  - "The layer eases off (MOTION_EASE.out 0.1 s, or outFast 0.05 s for 'dead'/'hit') whenever the word is busy ('climb', 'seat', 'dead', 'hit'), not grounded, swimming, or levitating."
  - "The clip machine still runs every group. Draws, sheathes, casts, bow draws, hit recoils, deaths, jumps and swims stay clip-owned."
  - "Rig state resets via `reset()` on activation, and peer bodies feed drawn-feet travel into gait (`src/net/peerBodies.js`)."
traps:
  - "Do not assume the bodyMotion.js header paths are live: it names systems/features.js and formats/morrowind/mwFirstPerson.js, but the files are src/mods/features.js and src/formats/mwFirstPerson.js."
  - "The 'mw-body-motion' toggle is viewer-local (store 'prefs', key 'mwBodyMotion', initial true) and never goes on the wire."
dfu: []
tags:
  - body-motion
  - morrowind
  - third-person
  - animation
  - skeleton
---

# Morrowind Body Motion: Third-Person Procedural Layer

The procedural body-motion layer drives third-person Morrowind biped legs, trunk, weapon carry, and melee swings over the clip machine so feet plant cleanly and legs keep striding through attacks.

- **Per-Rig Instance and `poseAssembly` Slot (`src/characters/bodyMotion/bodyMotion.js`, `src/combat/fpArm.js`, `src/formats/mwFirstPerson.js`):** Each `createFpArm` rig owns one `createBodyMotion` instance. Every frame, `fpArm.js` builds the frame state via `motionWord` (or `sceneInput`), steps clocks via `motion.step(dt, frame)`, and applies the solver through the `motion` slot of `poseAssembly` beneath climb, seat, and rifle overrides. This closes Morrowind-Rules rule 26 so attack clips no longer freeze the legs mid-stride.
- **Skeleton Measurement and Family Gate (`src/characters/bodyMotion/bodyKit.js`):** `bodyOf(skeleton, rootRef, skelMats)` measures rest-pose limb lengths, hip and shoulder widths, ankle height (`FOOT`), spine hierarchy, and weapon bones once per skeleton. `bodyKindOf(path)` accepts only `base_anim` paths without `wolf`, returning `'beast'` (`kna`), `'female'`, or `'male'`; werewolf and creature rigs return `null` and keep native clips.
- **Clip Coexistence and Viewer Switch (`src/mods/features.js`, `src/ui/settingsMap.js`):** Draws, sheathes, spell casts, bow shots, hit recoils, deaths, jumps, and swimming remain clip-owned. The layer eases in over `MOTION_EASE.in = 0.14` s and out over `MOTION_EASE.out = 0.1` s (`outFast = 0.05` s on `'dead'` or `'hit'`) when `busy` is set (`'climb'`, `'seat'`, `'dead'`, `'hit'`) or the actor is airborne, swimming, or levitating. Viewer-local feature `'mw-body-motion'` (`feat:mw-body-motion` in `src/ui/settingsMap.js`, prefs key `mwBodyMotion`, initial `true`) toggles immediately without wire traffic.
