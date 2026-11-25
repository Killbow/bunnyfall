---
slug: "weapon-widget-overview"
title: "Weapon Widget: FPSWeaponClone Ported 1:1 Beside the Classic Weapon"
domain: "combat"
kind: "overview"
parent: null
files:
  - "src/combat/weaponWidget.js"
  - "src/combat/weaponWidgetMotion.js"
  - "src/combat/weaponWidgetAssets.js"
  - "src/combat/weaponRig.js"
  - "src/mods/modSettings.js"
  - "src/combat/fpArm.js"
  - "vendor/weapon-widget/README.md"
  - "vendor/weapon-widget/modsettings.json"
  - "vendor/weapon-widget/weapon-widget.dfmod.json"
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Widget.md"
related:
  - "weapon-widget-motion-modules-and-rect"
  - "weapon-widget-swings-recoil-and-draw-seam"
  - "shield-widget-overview"
  - "two-hands-sprite-lane-mirror-guard-and-running"
  - "two-hands-mixed-pair-and-spell-hand"
  - "weapon-glow-classic-sprite-and-morrowind-rings"
invariants:
  - "`createWeaponWidget` (`src/combat/weaponWidget.js`) is owned per host by `src/combat/weaponRig.js` (alongside `offWidget` for two-hands), calling `lateUpdate(dt, ctx)` each frame, `draw(...)` in the draw seam, and `endOfFrame()` afterward."
  - "The widget clone reads the weapon state machine (`src/characters/weaponStates.js`) without driving it."
  - "Settings re-read every frame through `readWidgetSettings` (vendor key `\"weapon-widget\"` in `src/mods/modSettings.js`) with upstream `LoadSettings` multipliers applied."
  - "Morrowind first-person arms receive Position and Scale through `fpArm.setScreenTransform(widget.armsTransform)` while skipping the Offset slide (`withOffset: false`)."
  - "Shipped defaults keep `Modules.DoubleScaleTextures` `false`, `Inertia.Scale` `1.0`, and the Diverse Weapons preset off."
traps:
  - "Double-scale weapon PNGs (`173` renders of `ARENA2` art) are never committed to the repository; `weaponWidgetAssets.js` loads them from a local `.dfmod` (matched by GUID `9f301f2b-298b-43d8-8f3f-c54deaa841e0`, then title) or loose `w_<FILE>_<record>-<frame>[_<Metal>]` PNGs via `toScreenOrder`."
  - "Cross-mod hooks (`registerCustomWeapon`, `onToggleOffset`) and duplicate sound triggers (bow loose, unsheathe, combat grunt, boot sheathe clip) remain intentionally omitted."
dfu:
  - "Assets/Scripts/Game/FPSWeapon.cs"
tags:
  - "weapon-widget"
  - "mod-port"
  - "first-person"
  - "sprites"
  - "morrowind-arms"
  - "mod-settings"
---

# Weapon Widget: FPSWeaponClone Ported 1:1 Beside the Classic Weapon

The first-person weapon widget (`createWeaponWidget` in `src/combat/weaponWidget.js`) ports the upstream `FPSWeaponClone` mod beside the classic weapon machine (`src/characters/weaponStates.js`). Each host rig (`src/combat/weaponRig.js`) owns one widget instance, plus `offWidget` for two-handed loadouts, calling `lateUpdate(dt, ctx)` every frame, `draw(...)` in the first-person draw seam, and `endOfFrame()` afterward. The clone observes the weapon state machine without driving its transitions.

## Settings, Modules, and Asset Loading

Every frame, `readWidgetSettings` (`src/combat/weaponWidgetMotion.js`) reads the `weapon-widget` vendor table in `src/mods/modSettings.js` (backed by `vendor/weapon-widget/modsettings.json`) and applies the upstream `LoadSettings` multipliers across nine module switches: `Swings`, `Ambidexterity`, `Offset`, `Bob`, `Inertia`, `Step`, `DoubleScaleTextures`, `TrueTextureSize`, and `Recoil`. Shipped defaults keep `Modules.DoubleScaleTextures` at `false`, `Inertia.Scale` at `1.0`, and the Diverse Weapons preset disabled.

Look deltas map through `dfuLookAxes` (`src/ui/lookSettings.js`), while coroutines step as generators (`yield seconds` via `stepSecondsWaits` and `yield FRAME` via `endOfFrame()`). For Morrowind first-person arms (`src/combat/fpArm.js`), `fpArm.setScreenTransform(widget.armsTransform)` forwards Position and Scale while skipping the Offset slide (`withOffset: false`). Double-scale weapon PNGs (`173` renders of `ARENA2` art) load through `src/combat/weaponWidgetAssets.js` from a local `.dfmod` (GUID `9f301f2b-298b-43d8-8f3f-c54deaa841e0`, then title) or loose `w_<FILE>_<record>-<frame>[_<Metal>]` files converted via `toScreenOrder`.
