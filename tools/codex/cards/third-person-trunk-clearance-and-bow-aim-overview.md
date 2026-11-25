---
slug: third-person-trunk-clearance-and-bow-aim-overview
title: "Third-Person Trunk Clearance and Bow Spine Pitch"
domain: characters
kind: overview
parent: null
files:
  - src/characters/bodyMotion/bodyMotion.js
  - src/characters/bodyMotion/carry.js
  - src/characters/bodyMotion/melee.js
  - src/formats/mwFirstPerson.js
  - src/world/mat4.js
  - src/combat/spineAim.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26c.md"
related:
  - mw-shoulder-camera-offset
  - body-motion-overview
  - body-motion-weapon-carry-classes
  - body-motion-melee-blows-and-solver
invariants:
  - "TRUNK_CLEAR (0.29 arm lengths) is the default trunkClear for createBodyMotion and blowHands."
  - "carry.js trunkPush pushes both hands forward along the chest axis when the haft hand is nearer the trunk line than the clearance."
  - "rootSpaceTurn uses column-vector conjugation (local * W^T * R * W)."
  - "spinePitchFactor is 0 unless a ranged/thrown weapon is in wind-up/release/follow or a cast is above UPPER_BODY.WeaponEquipped."
  - "applySpineAim applies half the pitch times factor about -X on SPINE_AIM_BONES ('bip01 spine1' then 'bip01 spine2')."
traps:
  - "TWO_HAND_GRIP is an object keyed by class (two/wide/spear), not a scalar."
  - "Daggerfall StrikeUp maps to the Morrowind thrust through DF_STRIKE_TO_MW_ATTACK in src/formats/mwFirstPerson.js."
  - "Crossbow factor eases out over the first tenth of its follow phase."
  - "poseAssembly runs the aim slot after clip and neck, before body motion."
dfu: []
tags:
  - body-motion
  - third-person
  - melee
  - carry
  - bow
  - aim
  - spine
  - openmw-port
---

# Third-Person Trunk Clearance and Bow Spine Pitch

Third-person Morrowind body motion enforces torso grip clearance, chambers two-handed thrusts ahead of the hip, and pitches the upper spine during ranged or spell aim (`src/characters/bodyMotion/carry.js`, `src/characters/bodyMotion/melee.js`, `src/combat/spineAim.js`).

- **Trunk Clearance, Carry Rows, and Conjugation (`src/characters/bodyMotion/bodyMotion.js`, `src/characters/bodyMotion/carry.js`, `src/characters/bodyMotion/melee.js`, `src/world/mat4.js`):** `TRUNK_CLEAR` (`0.29` arm lengths) is the default `trunkClear` for `createBodyMotion` and `blowHands`. When the haft hand placed by `TWO_HAND_GRIP` (`{ two: -0.4, wide: 0.5, spear: 0.55 }`) sits closer to the trunk line than `trunkClear`, `trunkPush` shifts both hands forward along the chest axis. In `melee.js`, `MELEE.two.thrust` (mapped from Daggerfall `StrikeUp` via `DF_STRIKE_TO_MW_ATTACK` in `src/formats/mwFirstPerson.js`) chambers the hilt ahead of the right hip, while `CARRY.one.run` uses `row(8, 21, 16, -4, 0.35, ...)`. Bone rotation via `rootSpaceTurn` uses column-vector conjugation (`local * W^T * R * W`).
- **Ranged and Spell Spine Pitch (`src/combat/spineAim.js`, `src/formats/mwFirstPerson.js`):** Porting OpenMW `setPitchFactor` and `configureControllers`, `spinePitchFactor` stays `0` unless a bow, crossbow, or thrown weapon is in wind-up, release, or follow (easing crossbows out over the first tenth of follow) or a spell cast exceeds `UPPER_BODY.WeaponEquipped`. In `poseAssembly`, the `aim` slot runs after clip and neck and before body motion, calling `applySpineAim` to rotate each bone in `SPINE_AIM_BONES` (`'bip01 spine1'`, `'bip01 spine2'`) by half the pitch times factor around `-X`.
