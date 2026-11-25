---
slug: two-hands-mixed-pair-and-spell-hand
title: "The Spell Hand and Off-Hand Blow Selection"
domain: combat
kind: subcard
parent: two-hands-overview
files:
  - src/combat/twoHands/handsLaw.js
  - src/combat/twoHands/mixedArm.js
  - src/combat/twoHands/spellHand.js
  - src/combat/twoHands/spellHandArm.js
  - src/combat/playerWeapon.js
  - src/magic/hostMagic.js
  - src/combat/fpsSpellCasting.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Two-Hands.md"
related:
  - two-hands-overview
  - two-hands-flurry-and-dual-balance
  - two-hands-morrowind-mirror-rig-and-spread
invariants:
  - "`blowWeaponOf({ hand, weapon, offWeapon })` (`src/combat/twoHands/mixedArm.js`) returns `offWeapon` when `hand === 'L'` and `offWeapon` is present, and `weapon` otherwise."
  - "`spellHandOf({ lead, right, left, leftBusy })` (`src/combat/twoHands/spellHand.js`) returns `{ weaponHand, spellHand }` only when `leftBusy` is false, the lead hand passes `dualEligible`, and the free hand holds no weapon or shield (`free?.item` falsy)."
  - "A cast input pressed mid-swing queues on `castPending` (`tellCastPending` and `firePending` in `src/magic/hostMagic.js`) instead of dropping, and blocks new weapon swings until the cast finishes."
  - "`spellHandLimbs` (`src/combat/twoHands/spellHandArm.js`) composes `'idlespell'` onto the left arm (`'spellhand:ready'`) while readied and holds the right weapon arm in its weapon idle (`'spellhand:cast'`) while casting."
traps:
  - "`CAST_PRESS` is a single frozen `{ cast: true }` token so scene host closures do not add extra local declarations against the host logical-line ceiling."
  - "In 3D (`src/combat/twoHands/spellHandArm.js`), `SPELL_HAND_ARM` fixes `weapon: 'R'` and `spell: 'L'`, and `spellHandStanceStep` returns `'wait'` during equip or unequip so stance swaps never cross `'unequip detach'`."
dfu:
  - Assets/Scripts/Game/FPSSpellCasting.cs
  - Assets/Scripts/Game/WeaponManager.cs
tags:
  - combat
  - spell-hand
  - dual-wield
  - guards
---

A `dualEligible` one-handed weapon can hold a readied spell in the free hand, while `blowWeaponOf` (`src/combat/twoHands/mixedArm.js`) selects `offWeapon` when `hand === 'L'` and falls back to the main `weapon`.

## Spell Hand Law and 2D Drawing (`spellHand.js`)

In `src/combat/twoHands/spellHand.js`, `spellHandOf({ lead, right, left, leftBusy })` returns `{ weaponHand, spellHand }` when `leftBusy` is false, the lead weapon is `dualEligible`, and the opposite hand holds no item or shield (`free?.item` falsy). Dual-wielding pairs, fists, bows, staffs, shields, and held lights leave `spellHandOf` returning `null` for Daggerfall Unity two-handed casting.

While a spell hand is active, weapon swings keep using the swing control and casts fire on their own input (`ActivateCenterObject`, touch cast, or hotbar). `tellSpellHand` and `tellCastPending` track `spellHandUp`, `spellHandBusy`, and `castPending` across rigs (`CAST_PRESS = Object.freeze({ cast: true })` in `src/magic/hostMagic.js`), holding new blows until queued casts finish. In 2D (`src/combat/fpsSpellCasting.js`), `drawSpellHand` draws the free-hand cast frame offset down by `guardDrop(guard, h)` (`GUARD.LOWER`).

## 3D Morrowind Arm Composition (`spellHandArm.js`)

`src/combat/twoHands/spellHandArm.js` pairs `SPELL_HAND_ARM` (`weapon: 'R'`, `spell: 'L'`) with `createHeldClips` and `spellHandLimbs`: `'spellhand:ready'` puts the left arm in `'idlespell'`, while `'spellhand:cast'` holds the right weapon arm in its weapon idle (`drawsIntoSpellHand` and `spellHandStanceStep`).
