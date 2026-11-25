---
slug: body-motion-weapon-carry-classes
title: "Body Motion Carry: Weapon Classes, Haft Hand, and Arm Ownership"
domain: characters
kind: subcard
parent: body-motion-overview
files:
  - src/characters/bodyMotion/carry.js
  - src/characters/bodyMotion/bodyMotion.js
  - src/characters/bodyMotion/bodySolve.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Body-Motion.md"
related:
  - body-motion-overview
  - body-motion-melee-blows-and-solver
  - two-hands-morrowind-mirror-rig-and-spread
invariants:
  - "carryClassOf resolves in this order: spell -> 'clip'; shown fists -> 'fists'; not shown -> 'free'; dual -> 'dual'. Then by mwType: one-handers -> 'one', two-handers -> 'two', BluntTwoWide -> 'wide', SpearTwoWide -> 'spear', bow/crossbow/thrown -> 'clip', None -> 'fists'."
  - "The upper body follows arm ownership: the solver blends the chest toward the clip pose as far as the clip holds the arms (bodySolve.js armAny)."
  - "A torch, a spell hand, or a shield with 'one'/'free' hands the left arm to the clip (armW.L eases to 0), so the shield arm no longer pumps on the run (SHIELD-RUN)."
  - "Finger shapes stay with the clip. The layer only aims the hand fingers and palm directions."
traps:
  - "Empty third-person hands are MW_WEAPON_TYPE.None with 'single' mode. They must map to 'fists' or their blows vanish (AUDIT MELEE-3)."
  - "The left hand on a haft is placed by hafHand within TWO_HAND_HAFT and pushed out of the trunk by trunkPush against TRUNK_CLEAR 0.29 (TWO-CLEAR)."
dfu: []
tags:
  - body-motion
  - carry
  - two-handed
  - dual-wield
  - shield
---

# Body Motion Carry: Weapon Classes, Haft Hand, and Arm Ownership

The carry module defines anatomical shoulder and elbow rows per weapon class and gait, places two-handed haft grips, and yields arms or the trunk to the clip machine when required.

- **Carry Classes and Eases (`src/characters/bodyMotion/carry.js`, `src/characters/bodyMotion/bodyMotion.js`):** `carryClassOf` evaluates `spell` (`'clip'`), shown `hands === 'fists'` (`'fists'`), `!shown` (`'free'`), and `hands === 'dual'` (`'dual'`), then switches on `mwType` (`'one'`, `'two'`, `'wide'` for `BluntTwoWide`, `'spear'` for `SpearTwoWide`, `'clip'` for bows, crossbows, and thrown weapons, and `'fists'` for `MW_WEAPON_TYPE.None` so empty-hand blows never vanish). Class changes blend via `blendHand` over `MOTION_EASE.cls = 0.14` s; arm weights ease in over `armIn = 0.12` s and out over `armOut = 0.07` s.
- **Arm Kinematics and Two-Hand Hafts (`CARRY`, `src/characters/bodyMotion/bodySolve.js`):** `carryHands` blends `CARRY` rows by `gaitShares` (`blendRow`), builds limbs via `armByAngles`, aligns weapons with `gripRequest`, and mirrors dual-wield left hands with `mirrorRequest`. Two-handed classes place the left hand using `TWO_HAND_GRIP` (`{ two: -0.4, wide: 0.5, spear: 0.55 }` arm lengths from the right grip), slide within `TWO_HAND_HAFT` (`{ two: [-0.5, -0.2], wide: [0.15, 1.1], spear: [0.2, 1.0] }`) via `hafHand`, and push grips out of the torso via `trunkPush` against `TRUNK_CLEAR = 0.29`. `strideRide`, `rideOf`, and `turnAbout` steady blades against chest rotation.
- **Clip Ownership:** A torch, `spellHand`, or shield in `'one'` or `'free'` carry eases `armW.L` to `0`. In `solveBody`, `armAny = max(armL, armR)` scales chest, neck, and head turns while finger curl stays clip-owned.
