---
slug: two-hands-flurry-and-dual-balance
title: "Flurry Exchange and Dual-Wield Balance Terms"
domain: combat
kind: subcard
parent: two-hands-overview
files:
  - src/combat/twoHands/handsLaw.js
  - src/combat/playerWeapon.js
  - src/characters/weaponStates.js
  - src/combat/formulas.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Two-Hands.md"
related:
  - two-hands-overview
  - combat-formulas-and-power-ceiling
  - two-hands-mixed-pair-and-spell-hand
invariants:
  - "strikeHandOf marks a swing as a flurry when lastHand is 'R' or 'L' and sinceLast <= FLURRY_WINDOW (0.75 s); the non-last hand throws the flurry blow, otherwise leadHand opens, and off is true only in 'dual' mode when the striking hand is not leadHand."
  - "DUAL.FLURRY_FROM_FRAME = 1 starts a flurry blow one frame into its five-tick swing (0.8 of full swing duration at any frame rate)."
  - "offHandDamage keeps misses at 0 and scales landed blows to max(1, round(damage * 0.8)) via DUAL.OFF_DAMAGE (0.8)."
  - "offHandToHit(agility) equals clamp(-5 + round((agility - 50) * 0.1), -10, 0)."
  - "offHandBurden(weight, str) equals swingHeft(weight * 1.5, str) / swingHeft(weight, str) (DUAL.OFF_WEIGHT = 1.5); offHandHold pays (burden - 1) * ticks as whole held ticks at the end of the blow and carries the fractional remainder forward."
  - "OFF_HAND_BLOW passes { blowShare: offHandDamage, blowWeight: 0.8 } into calculateAttackDamage, which fires on-strike payloads whole only when rolls() < blowWeight."
traps:
  - "Never multiply tick duration by offHandBurden directly; continuous tick scaling rounds inconsistently across frame rates, whereas offHandHold pays whole held ticks."
  - "Bare fists keep classic hand-to-hand numbers: off and flurry dual-wield penalties apply only in 'dual' mode."
dfu:
  - Assets/Scripts/Game/WeaponManager.cs
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
tags:
  - combat
  - dual-wield
  - flurry
  - balance
  - off-hand
---

Dual wielding trades a shield for alternating tempo without doubling raw output. In `src/combat/twoHands/handsLaw.js` and `src/combat/playerWeapon.js`, the lead hand swings with unmodified Daggerfall formulas (`combat-formulas-and-power-ceiling`), while alternating follow-ups and off-hand blows follow `DUAL`.

## Alternating Flurry Exchange

`strikeHandOf({ mode, leadHand, lastHand, sinceLast })` checks `twoHanded(mode)`. When `lastHand` is `'R'` or `'L'` and `sinceLast <= FLURRY_WINDOW` (`0.75` seconds, `DUAL.FLURRY_WINDOW`), the opposite hand throws a flurry blow (`flurry: true`) starting at frame `DUAL.FLURRY_FROM_FRAME` (`1`) of the five-frame swing (`4/5 = 0.8` of normal swing time). If the window expires or `toggleHand` resets `_lastHand`, `leadHand` opens a new exchange from frame `0`.

## Off-Hand Terms (`off` when `mode === 'dual'` and `hand` is not `leadHand`)

- **Damage and on-strike chance (`OFF_HAND_BLOW`):** `offHandDamage(damage)` leaves `0` unchanged and scales positive damage to `Math.max(1, Math.round(damage * 0.8))` (`DUAL.OFF_DAMAGE`). In `src/combat/formulas.js`, on-strike payloads (`Strikes`) keep full strength when triggered but roll `rolls() < blowWeight` (`0.8`).
- **To-hit modifier:** `offHandToHit(agility)` applies `clamp(-5 + Math.round((agility - 50) * 0.1), -10, 0)` (`DUAL.OFF_TO_HIT`, from `-10` at Agility `0` to `0` at Agility `100`).
- **Weight burden (`offHandBurden`, `offHandHold`):** `offHandBurden(weight, str)` divides `swingHeft(weight * 1.5, str)` (`src/characters/weaponStates.js`, `DUAL.OFF_WEIGHT = 1.5`, capped at `SWING_FRAME_MAX / tick`) by `swingHeft(weight, str)`. `offHandHold` converts `(burden - 1) * ticks` into whole end-of-swing recovery ticks and carries the fractional remainder into the next off-hand swing.
