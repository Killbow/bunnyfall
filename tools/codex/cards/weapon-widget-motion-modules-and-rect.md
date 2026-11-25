---
slug: "weapon-widget-motion-modules-and-rect"
title: "Weapon Widget Motion: LoadSettings Multipliers, Offset, Bob, Inertia, and GetWeaponRect"
domain: "combat"
kind: "subcard"
parent: "weapon-widget-overview"
files:
  - "src/combat/weaponWidgetMotion.js"
  - "src/combat/weaponWidget.js"
  - "src/combat/weaponRig.js"
  - "src/player/motor.js"
  - "src/ui/lookSettings.js"
  - "src/combat/diverseWeapons.js"
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Widget.md"
related:
  - "weapon-widget-overview"
  - "weapon-widget-swings-recoil-and-draw-seam"
  - "body-motion-weapon-carry-classes"
invariants:
  - "readWidgetSettings multipliers: Offset.Speed x10, Bob.Length /100, Bob.SizeX/SizeY x2, Bob.SpeedMove x4, Bob.SpeedState x500, Bob.Shape x0.5, Inertia.Scale/Speed x500, Inertia.ForwardDepth/ForwardSpeed x0.2, Recoil.Chance /100, TrueTextureSize.TextureScaleFactor floored at 1."
  - "offsetSpeedLive = liveSpeed / 100 * offsetSpeed. The Offset hidden target is [2, 2] (two sprite heights down), and an equip countdown snaps both current and target there."
  - "bobStep: rate = baseSpeed * 1.25 * s * bobLength, size = 1% of the screen * s * SizeX/Y mod. s is halved crouching and halved riding, and standing sets s to 0.1 if Bob.BobWhileIdle, else 0."
  - "inertiaStep: local velocity is clamped /10. The x sign flips for a flipped sprite. speedMul is 3 when the target is non-zero, else 1. Forward depth shifts by fwd * screen width * 0.25 and adds to Scale."
  - "`widgetTransformRect` applies Position (subtracted when flipped), Scale (skipped for werecreatures), Offset in rect size, Step snap on `stepLength * screenH / 64` (half-to-even rounding), and `y` clamping so the rect never rises above rest."
traps:
  - "Only a `w_` hit drawn into the doubled box takes the doubled-idle bob (xMin/yMax 0) and the +0.5 half-size offset (doubledIdleNow). Classic frames, plain-name fall-through hits and the Morrowind arms keep the plain bob (DISC14-C, DW-CLIP)."
  - "Morrowind arms run dedicated bob integrators (`armsMoveSmooth` and `armsBobSmooth` into `armsPosition`) while sharing the Inertia delta; never feed `w.position` into `armsPosition`."
dfu:
  - "Assets/Scripts/Game/FPSWeapon.cs"
tags:
  - "weapon-widget"
  - "bob"
  - "inertia"
  - "offset"
  - "step"
  - "transform"
---

# Weapon Widget Motion: LoadSettings Multipliers, Offset, Bob, Inertia, and GetWeaponRect

`src/combat/weaponWidgetMotion.js` implements `readWidgetSettings`, `offsetStep`, `bobStep`, `inertiaStep`, and `widgetTransformRect` for `src/combat/weaponWidget.js` and `src/combat/weaponRig.js`. `readWidgetSettings(read, { preset })` overlays the Diverse Weapons preset (`src/combat/diverseWeapons.js`) unless `preset` is `false`, applying `LoadSettings` multipliers: `Offset.Speed` `x10`, `Bob.Length` `/100`, `Bob.SizeX`/`SizeY` `x2`, `Bob.SpeedMove` `x4`, `Bob.SpeedState` `x500`, `Bob.Shape` `x0.5`, `Inertia.Scale`/`Speed` `x500`, `Inertia.ForwardDepth`/`ForwardSpeed` `x0.2`, `Recoil.Chance` `/100`, and `TrueTextureSize.TextureScaleFactor` floored at `1`.

## Motion Integrators and Rect Transform

Every host reads standing, crouching, riding, and speed state from `motionBagOf(player)` (`src/player/motor.js`):

- **Offset (`offsetStep`):** Advances at `offsetSpeedLive = liveSpeed / 100 * offsetSpeed` toward hidden target `[2, 2]`, snapping current and target there during equip countdowns.
- **Bob (`bobStep`):** Ticks while idling or using a bow (`rate = baseSpeed * 1.25 * s * bobLength`, `size = 1%` screen times `s * SizeX/Y`; `s` halves crouching or riding and equals `0.1` standing with `Bob.BobWhileIdle`, else `0`). Only a `w_` texture in the doubled box uses `doubledIdleNow` (`xMin`/`yMax` `0`, `+0.5` half-size offset).
- **Inertia and Rect (`inertiaStep`, `widgetTransformRect`):** Runs in `Idle` (velocity clamped `/10`, `speedMul = 3` when target is non-zero else `1`, forward shift `fwd * screenW * 0.25`). Morrowind arms integrate `armsMoveSmooth` and `armsBobSmooth` into `armsPosition`. `widgetTransformRect` applies Position, Scale (skipped for werecreatures), Offset, Step snap (`stepLength * screenH / 64`, half-to-even), and `y` rest clamping.
