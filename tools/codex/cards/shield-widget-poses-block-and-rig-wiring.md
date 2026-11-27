---
slug: "shield-widget-poses-block-and-rig-wiring"
title: "Shield Widget Poses, Block Recoil, and Rig Wiring"
domain: "combat"
kind: "subcard"
parent: "shield-widget-overview"
files:
  - "src/combat/shieldWidget.js"
  - "src/combat/weaponRig.js"
  - "src/combat/formulas.js"
  - "src/combat/enemyEquipment.js"
routes: []
tables: []
replacesBible:
  - "05-Combat/Shield-Widget.md"
related:
  - "shield-widget-overview"
  - "combat-formulas-and-power-ceiling"
invariants:
  - "setBlock forces offsetX 1 and offsetY 0.8 regardless of player offsets."
  - "playImpactSound uses SoundClips.Parry1 + Random.Range(0, 9) (clips 428..436) at volume 1.1, non-positional."
  - "PCAAO seam: setAttackOnPlayerHook in src/combat/formulas.js feeds onAttackDamageCalculated at the tail of calculateAttackDamage."
  - "Frame gate in weaponRig.js is widgetOn() || _torchesOn || shieldOn() (SW1b)."
  - "On the classic one-hand path, `drawLayer` draws the shield first, then the Handheld Torches hand, then the weapon (the widget clone or the classic sprite), so nothing covers the weapon."
traps:
  - "Animated left-handed `setBlock` writes `shieldPositionCurrent` directly so the block snaps and `blockCoroutine` ease wait falls through."
  - "shieldItem() must use optional chaining, never materialize entity.equip (SW1a zeroed player weapons)."
  - "screenRect must use c?.width / c?.height, not canvas.width; takeFrameLook() returns an array, feed dfuLookAxes for inertia."
  - "`drawRect()` runs before the early return when the weapon is hidden so sheathed and casting poses still render."
dfu: []
tags:
  - "shield"
  - "block"
  - "recoil"
  - "audio"
  - "weapon-rig"
---

# Shield Widget Poses, Block Recoil, and Rig Wiring

Pose transitions, block recoil, and combat damage hooks connect `src/combat/shieldWidget.js` to `src/combat/weaponRig.js` and `src/combat/formulas.js`. When a block engages, `setBlock` forces `offsetX` to `1` and `offsetY` to `0.8` regardless of custom player offsets. For animated left-handed configurations, `setBlock` writes `shieldPositionCurrent` directly, snapping the shield into place so the `blockCoroutine` ease wait falls right through.

Combat impact detection runs through the PCAAO seam: `setAttackOnPlayerHook` in `src/combat/formulas.js` invokes `onAttackDamageCalculated` at the tail of `calculateAttackDamage`. Upon impact, `playImpactSound` selects a random clip from `SoundClips.Parry1 + Random.Range(0, 9)` (clips `428..436`) and plays it non-positionally at volume `1.1`. Off-hand readiness tracks `equipCountdownLeftHand` by reusing the shared equip countdown clock, and `getShieldRect` snaps placement along `stepLength * (screenH / 64)`.

Inside `src/combat/weaponRig.js`, the frame gate evaluates `widgetOn() || _torchesOn || shieldOn()`, and `drawRect()` runs before the hidden-weapon early return so sheathed and spell-casting shield poses still render. Third-person camera modes hide the sprite via `setThirdPerson(eotbHidesWeapon())`. In addition, `shieldItem()` must use optional chaining without materializing `entity.equip`, `screenRect` must read `c?.width` and `c?.height`, and `takeFrameLook()` must pass through `dfuLookAxes` for inertia.
