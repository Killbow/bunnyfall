---
slug: "handheld-torch-silence-and-caster-keep-ratio"
title: "Stowed Torch Silencing, Shadow Caster Hysteresis, and Render-Feet Lights"
domain: "rendering"
kind: "subcard"
parent: "shared-quest-relink-and-slope-foot-rest-overview"
files:
  - "src/items/lightSource.js"
  - "src/items/handheldTorches.js"
  - "src/combat/weaponRig.js"
  - "src/render/shadowPass.js"
  - "src/render/airPass.js"
  - "src/render/labGrass.js"
  - "src/render/windWisps.js"
  - "src/player/playerTorch.js"
  - "src/player/motor.js"
  - "src/magic/hostMagic.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-23.md"
related:
  - "shared-quest-relink-and-slope-foot-rest-overview"
  - "enhanced-lighting-shadow-maps-and-casters"
  - "enhanced-lighting-air-pass-post-chain"
  - "sky-weather-and-lighting"
invariants:
  - "All handheld light writes route through `setLightSource` (`src/items/lightSource.js`), and stowing a torch stops its audio loop immediately even while a UI window is open."
  - "Rig swaps call `silenceTorch()` on the outgoing rig and restart the burn loop on the incoming rig only if the torch remains equipped."
  - "Shadow casters active on the prior frame rank at `CASTER_KEEP_RATIO = 0.8` of distance (`CASTER_KEEP_RATIO_STEADY = 0.65`) to prevent ceiling-lamp tie flicker."
  - "Contact shadows sample prior depth through `holdPrevRect` and `prevDepthUV` so docked HUD viewports do not skew coordinates."
traps:
  - "`SHADOW_POINT_CASTERS` in `src/render/shadowPass.js` is `12` in live code."
  - "Handheld lights attach to `motor.js` `feetAt()` (render feet) rather than stepped feet so lights do not slide above `60` Hz, while third-person bodies read `bodyFeetAt()` bypassing `STEP_SMOOTH_TAU = 0.06`."
dfu:
  - "Assets/Scripts/Game/FPSWeapon.cs"
tags:
  - "torch"
  - "lighting"
  - "shadows"
  - "fog"
  - "wisps"
---

# Stowed Torch Silencing, Shadow Caster Hysteresis, and Render-Feet Lights

In `src/items/lightSource.js`, `src/items/handheldTorches.js`, and `src/combat/weaponRig.js`, all handheld light mutations route through `setLightSource`. Stowing a torch stops its burning audio loop immediately even while a UI window is open. Rig swaps call `silenceTorch()` on the outgoing rig and restart the burn loop on the incoming rig only when the torch stays equipped.

In `src/player/playerTorch.js`, `src/player/motor.js`, and `src/magic/hostMagic.js`, handheld lights attach to `feetAt()` (render feet) rather than stepped feet so lights never slide at frame rates above `60` Hz. Third-person bodies read `bodyFeetAt()`, bypassing `STEP_SMOOTH_TAU = 0.06`.

In `src/render/shadowPass.js` (`SHADOW_POINT_CASTERS = 12`), shadow casters active on the previous frame rank at `CASTER_KEEP_RATIO = 0.8` of their distance (`CASTER_KEEP_RATIO_STEADY = 0.65`) to eliminate ceiling-lamp tie flicker. In `src/render/airPass.js`, contact shadows sample prior depth via `holdPrevRect` and `prevDepthUV` so docked HUD viewports do not skew depth coordinates. In `src/render/labGrass.js`, grass inherits terrain fog through `GRASSFOG_VS_EDITS` and `GRASSFOG_FS_EDITS`, while `src/render/windWisps.js` caps active wind wisps at `WISP_MAX = 120`.
