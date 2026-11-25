---
slug: "handheld-torches-hand-law-and-keys"
title: "Handheld Torches Free-Hand Law, Stow, and Light/Drop/Throw Actions"
domain: "items"
kind: "subcard"
parent: "handheld-torches-overview"
files:
  - "src/items/handheldTorches.js"
  - "src/characters/equip.js"
  - "src/ui/inputActions.js"
  - "src/ui/enhancedInventory.js"
  - "src/mods/modSettings.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Handheld-Torches.md"
related:
  - "handheld-torches-overview"
  - "two-hands-overview"
  - "spell-hand-wire-pose-and-torch-stow"
  - "ui-arc-input-dispatch-and-key-edges"
  - "ui-arc-enhanced-inventory-and-pack"
invariants:
  - "updateFreeHand reads the live slots EQUIP_SLOTS.LeftHand (21) and RightHand (19). Any worn item takes its hand whatever the stance (HT7). A bare hand counts as taken only while the weapon is up and that hand is the active one."
  - "A Both-handed item (DFU ItemHands: None 0, Either 1, Both 2, LeftOnly 3, RightOnly 4) in the right hand takes the left hand too. With RelaxedTwoHandedWeapons on, it takes the left only for a bow or during a swing. A Both item or a bow in the left hand takes the right."
  - "Spellcasting, climbing and swimming (each behind its Stow setting) and transformedLycanthrope clear both hands."
  - "With no free hand, lit torches and candles drop when `OnStow > Unequip` and floor geometry allows, or store in `lastLightSource` to relight when a hand frees; lit lanterns stow unless `RelaxedLanterns` or waist carry applies."
  - "toggleLightSourceAction douses the lit light (clip 381) or relights lastLightSource. Otherwise it lights from the pack in this order: lantern (lanternFirst), torch, candle, holy candle. Ignite plays clip 16 at volume 0.5."
  - "dropLightSourceAction never drops a lantern. dropLightSource casts 1.45 forward along yaw, then 145 down, and spawns with condition * 20 s (clip 380)."
  - "Throw wind-up: throwTimer += dt * ThrowScaleSpeed, and release strength is clamp(throwTimer / 1, 0.25, 2) (clip 106). The wind-up douses the lit light (except a relaxed or waist lantern), so throwLightSourceAction throws the first torch in the pack."
  - "The held light shows as LIGHT_SLOT = -1 in the Enhanced inventory hand row. Dragging a light onto the body runs localPrimaryAct, which returns Light or Douse."
traps:
  - "Internal `ITEM_HANDS` values differ from upstream `ItemHands` enum ordinals: always compare against `ITEM_HANDS.Both` rather than literal `2`."
  - "Legacy mod `KeyCode` text settings are inert at runtime; bind `TorchToggleLight`, `TorchDrop`, and `TorchThrow` through `src/ui/inputActions.js`."
dfu:
  - "Assets/Scripts/DaggerfallUnityEnums.cs"
  - "Assets/Scripts/Game/WeaponManager.cs"
  - "Assets/Scripts/Game/Items/ItemCollection.cs"
tags:
  - "handheld-torches"
  - "free-hand"
  - "two-handed"
  - "keybinds"
  - "inventory-drag"
---

# Handheld Torches Free-Hand Law, Stow, and Light/Drop/Throw Actions

In `src/items/handheldTorches.js` and `src/characters/equip.js`, `updateFreeHand` inspects `EQUIP_SLOTS.LeftHand` (`21`) and `RightHand` (`19`).

- **Hand availability and stowing:** Any worn item occupies its hand regardless of stance, while a bare hand counts as busy only when weapons are raised and that hand is active. A `Both` item (always check `ITEM_HANDS.Both` rather than literal `2`) in the right hand also occupies the left hand unless `RelaxedTwoHandedWeapons` (`src/mods/modSettings.js`) restricts left-hand occupation to bows and active swings; a `Both` item or bow in the left hand takes the right. Spellcasting, climbing, swimming (per stow settings), and `transformedLycanthrope` clear both hands. With no free hand, torches and candles drop when `OnStow > Unequip` or save into `lastLightSource` to relight later; lanterns stow unless `RelaxedLanterns` or waist carry applies (`CLIPS.stow = 417`, `burning = 420`).
- **Actions and inventory UI:** Registry actions (`src/ui/inputActions.js`) drive `TorchToggleLight` (`toggleLightSourceAction`, douse clip `381`, ignite clip `16` at volume `0.5`, priority: `lanternFirst`, torch, candle, holy candle), `TorchDrop` (`dropLightSourceAction`, forward `1.45`, down `145`, clip `380`, never lanterns), and `TorchThrow` (`throwTimer += dt * ThrowScaleSpeed`, strength `0.25` to `2`, clip `106`, `300` trajectory steps at `0.02` s, speed `25`, gravity `9.8`). `src/ui/enhancedInventory.js` displays held lights at `LIGHT_SLOT = -1` and routes body drops through `localPrimaryAct`.
