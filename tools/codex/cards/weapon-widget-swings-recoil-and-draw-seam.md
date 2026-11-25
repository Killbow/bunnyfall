---
slug: "weapon-widget-swings-recoil-and-draw-seam"
title: "Weapon Widget Swings, Recoil, Sounds, and the Draw Seam"
domain: "combat"
kind: "subcard"
parent: "weapon-widget-overview"
files:
  - "src/combat/weaponWidget.js"
  - "src/combat/weaponRig.js"
  - "src/combat/playerWeapon.js"
  - "src/characters/weaponStates.js"
  - "src/combat/twoHands/twoHands.js"
  - "src/combat/twoHands/spellHand.js"
  - "src/combat/twoHands/handsLaw.js"
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Widget.md"
related:
  - "weapon-widget-overview"
  - "weapon-widget-motion-modules-and-rect"
  - "two-hands-mixed-pair-and-spell-hand"
  - "two-hands-sprite-lane-mirror-guard-and-running"
  - "martial-swing-pace-and-frame-floor"
invariants:
  - "widgetAnimTickTime: a bow takes CLASSIC_UPDATE_INTERVAL (0.0625), melee takes getMeleeWeaponAnimTime. With Swings on, the tick is remapped to Lerp(0.045918, 0.352041, InverseLerp(0, 2, t / 0.198979))."
  - "playWeaponAnimation ticks at widgetAnimTickTime / 5 / Swings.Speed, halved when VanillaRecoveryOverride applies. Its reverse recovery is latched (`reversed`) so it runs once (F1)."
  - "`overrideAlignment` centers `StrikeDown` and `StrikeUp` for every weapon type except Bow, bare hands (`Melee`), Dagger, and Warhammer (including werecreatures); `offsetOverride` excludes bare hands and werecreatures, and `recoveryOverride` applies to `StrikeUp` on non-daggers."
  - "mirrorOverride requires getItemHands(...) === ITEM_HANDS.Both (DFU ItemHands.Both, not LeftOnly)."
  - "draw() returns true and draws nothing for frame -1, hideWeapon, third person, or (Offset off and not shown). Only genuinely not-applicable cases return false and let the classic sprite fall through (WW4)."
  - "changeWeaponState(Idle) lifts a melee frame of -1 back to 0 (WW4b), so Recovery = Hide never leaves the idle invisible."
traps:
  - "Bow release plays solely through the weapon machine `bowSound` (the widget bow coroutine is silent); only the melee swing sound (`volume 1.1`) plays from the widget."
  - "`lastSheathed` initializes from the first frame so loading a save never triggers `SHEATHE_CLIP` (`417`)."
dfu:
  - "Assets/Scripts/Game/FPSWeapon.cs"
  - "Assets/Scripts/Game/Formulas/FormulaHelper.cs"
tags:
  - "weapon-widget"
  - "swings"
  - "recoil"
  - "bow"
  - "two-hands"
  - "draw-seam"
---

# Weapon Widget Swings, Recoil, Sounds, and the Draw Seam

`src/combat/weaponWidget.js` and `src/combat/weaponRig.js` coordinate swings, recoil, and the draw seam with `src/combat/playerWeapon.js` and `src/characters/weaponStates.js`.

## Swings, Overrides, and Recoil

`widgetAnimTickTime` uses `CLASSIC_UPDATE_INTERVAL` (`0.0625`) for bows and `getMeleeWeaponAnimTime` for melee, remapping `t` with `Swings` on to `Lerp(0.045918, 0.352041, InverseLerp(0, 2, t / 0.198979))`. `playWeaponAnimation` steps at `widgetAnimTickTime / 5 / Swings.Speed` (halved by `VanillaRecoveryOverride`) and latches reverse recovery via `reversed`. Only melee swing audio (`volume 1.1`) plays here (`bowSound` handles bows), and `lastSheathed` seeds on frame one to skip `SHEATHE_CLIP` (`417`).

`overrideAlignment` centers `StrikeDown` and `StrikeUp` except on Bow, `Melee`, Dagger, and Warhammer (including werecreatures); `offsetOverride` excludes bare hands and werecreatures, `recoveryOverride` covers non-dagger `StrikeUp`, and `mirrorOverride` requires `getItemHands(...) === ITEM_HANDS.Both`. `playerWeapon.onAttackResult` calls `onAttackDamageCalculated` on the striking widget (`recoilChance`, `RECOIL_CONDITION`), spawning `MISS_VFX` (`TEXTURE.380` record `2`, `20` fps, `vfxAt` `0.75` or `MISS_VFX_AT.Crosshair`) via `checkForEnvDamage` (`WEAPON_REACH`, `1.25x` on `StrikeUp`).

## Draw Seam and Off-Hand

`draw()` returns `true` (blank) for frame `-1`, `hideWeapon`, third person, or unshown `Offset`, and `false` only when inapplicable; `changeWeaponState(Idle)` lifts melee frame `-1` to `0`. `offWidget` (`handedness: false`) shares `clockOf`, mirrors `pairHand` UVs (`src/combat/twoHands/twoHands.js`), and drops by `guardDrop` (`GUARD.LOWER = 0.12`, `src/combat/twoHands/spellHand.js`) opposite `widget.flipHorizontal` during casts.
