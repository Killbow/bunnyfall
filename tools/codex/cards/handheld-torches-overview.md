---
slug: "handheld-torches-overview"
title: "Handheld Torches: Port Shape, Hosts, and Port Defaults"
domain: "items"
kind: "overview"
parent: null
files:
  - "src/items/handheldTorches.js"
  - "src/items/droppedTorches.js"
  - "src/items/lightSource.js"
  - "src/combat/weaponRig.js"
  - "src/mods/modSettings.js"
  - "src/ui/inputActions.js"
  - "src/platform/settings.js"
  - "src/formats/color32Order.js"
  - "src/scenes/world.js"
  - "src/scenes/exterior.js"
  - "src/scenes/worldModes.js"
  - "src/scenes/dungeonContext.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Handheld-Torches.md"
related:
  - "handheld-torches-hand-law-and-keys"
  - "dropped-and-thrown-torch-pool"
  - "waist-lantern-bodies-and-peer-light"
  - "belt-waist-lanterns-and-festival-cake-cap-overview"
  - "handheld-torch-silence-and-caster-keep-ratio"
  - "spell-hand-wire-pose-and-torch-stow"
invariants:
  - "HANDHELD_TORCHES_MOD pins Handheld Torches 1.4.1 (vendor key 'handheld-torches'). The HandheldTorches MonoBehaviour becomes createHandheldTorches in src/items/handheldTorches.js. HandheldTorchesProjectile, HandheldTorchesEnemyLight and the save data become createDroppedTorches in src/items/droppedTorches.js."
  - "The weapon rig owns the component (weaponRig.js:638). It calls handheld.update and handheld.lateUpdate each frame (weaponRig.js:1653-1654) and handheld.draw in the sprite pass (weaponRig.js:2082), standing in for Update, LateUpdate and OnGUI repaint."
  - "Each world host builds its own dropped pool: world.js, exterior.js, worldModes.js (interiors) and dungeonContext.js all call createDroppedTorches."
  - "Every write to entity.lightSource goes through setLightSource (src/items/lightSource.js), which notifies listeners only on a real change."
  - "Port defaults (`src/mods/modSettings.js`): `Modules.Sprite = true`, `Modules.Bob = true`, `Handling.RelaxedTwoHandedWeapons = false`, `Handling.OnStow = 0` (`Unequip`), `ManualDropInput = \"G\"`, toggle action `KeyO`, and `Handling.LanternsAtWaist = true`."
  - "PORT_DEFAULTS in src/platform/settings.js sets Enhancements/PlayerTorchFromItems to 'True' (DFU ships False)."
traps:
  - "Held torch sprites upload through `toScreenOrder` (`src/formats/color32Order.js`) rather than `toColor32` so flames do not flip upside down."
  - "Always call exported `isHeldLight` in draw ladders rather than duplicating held-light checks."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
  - "Assets/Scripts/Game/WeaponManager.cs"
  - "Assets/Scripts/Game/PlayerTorch.cs"
tags:
  - "handheld-torches"
  - "light-source"
  - "mod-port"
  - "defaults"
---

# Handheld Torches: Port Shape, Hosts, and Port Defaults

The `HANDHELD_TORCHES_MOD` descriptor pins Handheld Torches 1.4.1 (vendor key `'handheld-torches'`), splitting upstream behavior across `createHandheldTorches` in `src/items/handheldTorches.js` and `createDroppedTorches` in `src/items/droppedTorches.js`.

- **Rig ownership and world hosts:** `src/combat/weaponRig.js` owns the held component, calling `handheld.update` and `handheld.lateUpdate` every frame and `handheld.draw` during the sprite pass (`SPRITE_ARCHIVE = 112359`, `ANIMATION_TIME = 0.0625` s per frame, `SECONDS_PER_CONDITION = 20`). Held sprites upload through `toScreenOrder` (`src/formats/color32Order.js`) rather than `toColor32` so flames stay upright, and draw ladders query exported `isHeldLight`. Each scene host (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, and `src/scenes/dungeonContext.js`) creates its own dropped pool (`DROPPED_ARCHIVE = 112358`).
- **Light mutations and defaults:** Every write to `entity.lightSource` passes through `setLightSource` (`src/items/lightSource.js`), notifying listeners only on actual changes. `PORT_DEFAULTS` in `src/platform/settings.js` enables `Enhancements/PlayerTorchFromItems` (`'True'`). In `src/mods/modSettings.js` and `src/ui/inputActions.js`, port defaults set `Modules.Sprite = true`, `Modules.Bob = true`, `Handling.RelaxedTwoHandedWeapons = false`, `Handling.OnStow = 0` (`Unequip`), `Handling.LanternsAtWaist = true`, and bind `TorchToggleLight` (`KeyO`), `TorchDrop` (`KeyG`), and `TorchThrow` (`KeyX`).
