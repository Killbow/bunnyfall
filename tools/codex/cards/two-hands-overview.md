---
slug: two-hands-overview
title: "Two Hands: Hands Mode, Lead Hand, and the Two Lanes"
domain: combat
kind: overview
parent: null
files:
  - src/combat/twoHands/handsLaw.js
  - src/combat/twoHands/twoHands.js
  - src/combat/twoHands/mirrorRig.js
  - src/combat/playerWeapon.js
  - src/combat/weaponRig.js
  - src/combat/fpArm.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Two-Hands.md"
related:
  - two-hands-flurry-and-dual-balance
  - two-hands-sprite-lane-mirror-guard-and-running
  - two-hands-morrowind-mirror-rig-and-spread
  - two-hands-mixed-pair-and-spell-hand
  - combat-formulas-and-power-ceiling
invariants:
  - "handsModeOf returns 'single' when claws (a transformed lycanthrope) or leftBusy (a hand-held light source) is active, 'fists' when both hands are empty, 'dual' when both hands pass dualEligible, and 'single' otherwise."
  - "dualEligible requires an equipped item that is not a shield, does not have ItemHands.Both (4), and has a type in DUAL_TYPES ([0, 1, 4..13])."
  - "twoHanded(mode) returns true only for 'fists' and 'dual'; only those two modes draw and swing a second hand."
  - "Pressing toggleHand (H) in a two-handed mode clears _lastHand and sets _lastEnd = -Infinity so the next swing opens a fresh exchange with the new lead hand."
traps:
  - "A shield does not count as an empty hand: an empty hand paired with a shield resolves to 'single', not 'fists'."
  - "src/combat/twoHands/handsLaw.js is pure and reads no settings or equipment table; callers pass each hand descriptor as { item, type, hands, shield }."
dfu:
  - Assets/Scripts/Game/WeaponManager.cs
  - Assets/Scripts/Game/FPSWeapon.cs
tags:
  - combat
  - two-hands
  - dual-wield
  - fists
  - hands-mode
---

Classic Daggerfall fights with one active hand at a time (`usingRightHand`, toggled by `ToggleHand` in `WeaponManager.cs:702`). Bunnyfall preserves that hand as the player `leadHand` (`'R'` or `'L'`) while drawing and swinging both hands whenever `handsModeOf` in `src/combat/twoHands/handsLaw.js` resolves to one of the two-handed `HANDS_MODE` states (`Single: 'single'`, `Fists: 'fists'`, `Dual: 'dual'`).

## Mode Resolution and Eligibility

`handsModeOf({ right, left, claws, leftBusy })` returns `'single'` immediately if `claws` (lycanthrope transformation) or `leftBusy` (hand-carried light) is truthy. When both `.item` fields are null and neither hand carries a shield, it returns `'fists'`. When both hands pass `dualEligible` (non-shield item, `hands !== 4`, and `type` in `DUAL_TYPES` `[0, 1, 4..13]`), it returns `'dual'`. All remaining loadouts fall back to `'single'`.

## Shared Law Across Both Visual Lanes

Both first-person presentation lanes and the combat state machine consume `handsLaw.js`:

- **Swing scheduling (`src/combat/playerWeapon.js`):** `strikeHandOf` picks the striking hand and flags off-hand and flurry blows; `toggleHand` flips `leadHand`, clears `_lastHand`, and resets `_lastEnd = -Infinity`.
- **2D sprite lane (`src/combat/twoHands/twoHands.js`, `src/combat/weaponRig.js`):** `createTwoHands` drives the mirrored off-hand widget, guard offsets, and running fists.
- **3D Morrowind arm lane (`src/combat/fpArm.js`, `src/combat/twoHands/mirrorRig.js`):** `applyMirrorRig` mirrors bone deltas and `Weapon Bone Left` attachments.
