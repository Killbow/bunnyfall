---
slug: "shield-widget-overview"
title: "Shield Widget Off-Hand Sprites, Archives, and Condition Art"
domain: "combat"
kind: "overview"
parent: null
files:
  - "src/combat/shieldWidget.js"
  - "src/combat/shieldWidgetAssets.js"
  - "src/combat/weaponRig.js"
  - "src/mods/modSettings.js"
  - "vendor/shield-widget/README.md"
  - "vendor/shield-widget/modsettings.json"
  - "vendor/shield-widget/modpresets.json"
  - "vendor/shield-widget/shield-widget.dfmod.json"
  - "src/formats/color32Order.js"
routes: []
tables: []
replacesBible:
  - "05-Combat/Shield-Widget.md"
related:
  - "shield-widget-poses-block-and-rig-wiring"
  - "weapon-glow-overview"
  - "combat-formulas-and-power-ceiling"
invariants:
  - "`createShieldWidget` ports the DLL `ShieldWidget` methods 1:1, preserving upstream `SetBlock` behavior."
  - "Settings live under `shield-widget` in `src/mods/modSettings.js` and are read by `readShieldWidgetSettings` with mod multipliers (`Shield.Speed * 5000`, `animationTime = 1 - v * 0.5`)."
  - "offsetSpeedLive = LiveSpeed / 100 * offsetSpeed; animationTimeLive = animationTime / (LiveSpeed / 50)."
  - "600 sprites across archives 112360 Buckler, 112361 Round, 112362 Kite, 112363 Tower."
  - "shieldTextureIndex = (archive - 112360) * 150 + record * 5 + frame; record = material group 0..9 plus condition tier +0/+10/+20; 5 frames 0..4."
  - "Template reload key is templateIndex * 1024 + nativeMaterialValue (departure from the mod's colliding addition)."
traps:
  - "Higher Animation.Speed means a SHORTER animation (inverted formula)."
  - "FPS-models seam (41284af0-81c7-4630-bbc5-a976efa162a0) and Unity plumbing are not carried."
  - "Use `toScreenOrder` and `toColor32` from `src/formats/color32Order.js` rather than ad-hoc row flips."
  - "Resting thresholds 60/30 are overwritten by settings defaults 75/25 on first load."
  - "SW4: PNGs were once extracted upside down from Unity's bottom-up Texture2D layout; use toScreenOrder/toColor32 from src/formats/color32Order.js, never ad-hoc row flips."
dfu: []
tags:
  - "shield"
  - "first-person"
  - "mod-port"
  - "hud"
  - "sprites"
  - "textures"
  - "condition"
---

# Shield Widget Off-Hand Sprites, Archives, and Condition Art

The first-person shield widget lives in `src/combat/shieldWidget.js`, where `createShieldWidget` ports the original DLL `ShieldWidget` methods 1:1 while preserving upstream `SetBlock` behavior. Sprite decoding sits in `src/combat/shieldWidgetAssets.js`, backed by vendored metadata under `vendor/shield-widget/`. Host integration in `src/combat/weaponRig.js` checks `shieldOn()`, resolves the equipped shield through `shieldItem()`, and caches GPU handles in the `_shieldTex` map via `renderer.uploadTexture`.

Configuration lives under `shield-widget` in `src/mods/modSettings.js`. On load, `readShieldWidgetSettings` applies mod multipliers (`Shield.Speed * 5000` and `animationTime = 1 - v * 0.5`), where a higher `Animation.Speed` produces a shorter duration. Live scaling derives `offsetSpeedLive = LiveSpeed / 100 * offsetSpeed` and `animationTimeLive = animationTime / (LiveSpeed / 50)`. Initial resting thresholds of 60 and 30 are overwritten by settings defaults 75 and 25 on first load, and `hitShield` re-checks threshold crossings live so shields visibly degrade mid-fight.

The 600 sprites span archives 112360 (Buckler), 112361 (Round), 112362 (Kite), and 112363 (Tower). Each texture resolves via `shieldTextureIndex = (archive - 112360) * 150 + record * 5 + frame`, combining material group `0..9`, condition tier `+0/+10/+20`, and frames `0..4`. The reload key uses `templateIndex * 1024 + nativeMaterialValue` to prevent collisions, and row ordering relies on `toScreenOrder` and `toColor32` from `src/formats/color32Order.js`.
