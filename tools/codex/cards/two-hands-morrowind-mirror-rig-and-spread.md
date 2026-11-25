---
slug: two-hands-morrowind-mirror-rig-and-spread
title: "Morrowind Arm: Mirror Rig, Weapon Bone Left, and Pair Spread"
domain: combat
kind: subcard
parent: two-hands-overview
files:
  - src/combat/twoHands/mirrorRig.js
  - src/combat/twoHands/handsLaw.js
  - src/combat/fpArm.js
  - src/formats/mwFirstPerson.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Two-Hands.md"
related:
  - two-hands-overview
  - two-hands-sprite-lane-mirror-guard-and-running
  - mw-gpu-skinning-and-sprite-batch
invariants:
  - "src/combat/twoHands/mirrorRig.js stores zero hard-coded skeleton offsets; counterpart bones are matched by name (counterpartName: L/R, Left/Right, and 'Weapon Bone' / 'Weapon Bone Left'), and the mirror plane is derived from the rest middle of the skeleton."
  - "Each bone mirrors the local rest-pose delta of its counterpart as L'(b) = RestL(b) * K^-1 * (RestL(m)^-1 * L(m)) * K so every joint remains attached to its parent."
  - "A first-person plane request mirrors the arm across the upright plane passing through the camera eye (shifted by dx), rather than the chest plane."
  - "offWeaponBoneAddon returns null when 'Weapon Bone Left' already exists; otherwise it attaches one under the left hand using skin bind symmetry (skinHandMirror) with a rest-pose fallback."
  - "pairSpreadAngle bisects within [MIN 0.04, MAX 0.2] picture-height fractions until the inner edges of both blades sit GAP 0.04 apart, easing the angle with TAU 0.12 s."
traps:
  - "Never position a mirrored arm in absolute scene-graph space; spine twist detaches the mirrored shoulder from the clavicle and chest."
  - "Morrowind attachment rule 13 negates local X for any part mounted on a 'Left' node, so the local transform of the addon includes X = diag(-1, 1, 1)."
dfu: []
tags:
  - combat
  - morrowind
  - skeleton
  - mirror-rig
  - dual-wield
---

`src/combat/twoHands/mirrorRig.js` mirrors first-person 3D skeletal poses and left-hand weapon mounts for `src/combat/fpArm.js` (`src/formats/mwFirstPerson.js`).

## Relative Bone-Delta Mirroring and `Weapon Bone Left`

`counterpartName` maps `L`/`R` tokens, `Left`/`Right` substrings, and `'Weapon Bone'` to `'Weapon Bone Left'`. Rather than placing mirrored limbs in absolute model space, `applyMirrorRig` computes the local motion delta of each bone from its rest transform (`RestL(m)^-1 * L(m)`), conjugates that delta by the reflection matrix `K`, and multiplies onto `RestL(b)`:

`L'(b) = RestL(b) * K^-1 * (RestL(m)^-1 * L(m)) * K`

When a `plane` request is passed for the first-person camera, the reflection conjugation uses the upright plane through the camera eye (`+ dx`) so the off-hand crosses the screen center symmetrically. If the loaded NIF lacks `'Weapon Bone Left'`, `offWeaponBoneAddon` (`WEAPON_BONE_LEFT_SOURCE = 'mirrorRig.offWeaponBoneAddon'`) synthesizes one under `'Bip01 L Hand'` from `'Weapon Bone'` using `skinHandMirror` bind symmetry (including `X = diag(-1, 1, 1)` for Left-node X negation).

## 3D Guard, Running Fists, and Blade Spread

In 3D, resting guard lowers the shoulder via a `dip` request, and `RUN_3D` widens running fists (`TOP: { x: 0.6, y: -0.62, d: 0.42 }`, `BOTTOM: { x: 0.8, y: -1.7, d: 0.38 }`, `CURL: 1.5`). When two tall blades overlap near screen center, `pairSpreadAngle` (`PAIR_SPREAD`) bisects within `[MIN: 0.04, MAX: 0.2]` until inner blade edges clear `GAP = 0.04`, smoothing via `easePairSpread` (`TAU = 0.12` seconds).
