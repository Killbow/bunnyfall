---
slug: "steel-plate-worn-slots-and-helm-switch"
title: "Steel Plate Worn Slots, Hides, and the Steel Helm Switch"
domain: "characters"
kind: "subcard"
parent: "steel-plate-armor-overview"
files:
  - "src/characters/ownArmorModels.js"
  - "src/formats/mwItemMap.js"
  - "src/formats/mwFirstPerson.js"
  - "src/combat/fpArm.js"
  - "src/mods/features.js"
  - "src/ui/enhancedMenu.js"
  - "src/characters/headPortraits.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Steel-Plate.md"
related:
  - "steel-plate-armor-overview"
  - "steel-plate-bake-and-retail-bind"
  - "wardrobe-drawn-piece-rendering"
  - "body-motion-overview"
  - "characters-paperdoll-and-bodies"
invariants:
  - "`composeWornArmor` (`src/formats/mwItemMap.js`) claims `ARMO_PART` slots at armor priority, occupying each part `hides` list with an empty entry so underlying skin is skipped."
  - "First-person arms consume `fpShadows` (`shadowSkinRows` in `src/combat/fpArm.js`); a hidden body part whose `under` mesh is absent in first person (such as upper arm under a pauldron) stays visible in first person."
  - "`STEEL_HELM_STYLES = [\"closed\", \"open\"]` defaults to `STEEL_HELM_DEFAULT = \"closed\"` (`mwSteelHelm` pref in `src/mods/features.js`)."
traps:
  - "The plate skirt occupies `ARMO_PART` `\"skirt\"` with `shadows: null`, leaving groin skin drawn underneath; clothing skirts reserve slots at higher priority and override the plate skirt and greaves."
  - "`mwSteelHelm` is strictly a viewer-side preference: never add it to wire frames, and keep `src/characters/headPortraits.js` cache keys coupled to `getPref(\"mwSteelHelm\")`."
dfu: []
tags:
  - "armor"
  - "slots"
  - "first-person"
  - "settings"
  - "helm"
  - "steel-plate"
---

# Steel Plate Worn Slots, Hides, and the Steel Helm Switch

Equipped Steel Plate pieces claim Morrowind body-part slots in `src/formats/mwItemMap.js` and bind by bone name via `bindPartsInto` in `src/formats/mwFirstPerson.js`, while a viewer-local preference switches between closed and open helms.

- **Slot claiming, hides, and first-person arms (`src/formats/mwItemMap.js`, `src/combat/fpArm.js`):** `composeWornArmor` claims `ARMO_PART` slots at armor priority and fills each part `hides` list with an empty entry so underlying skin is skipped. The plate skirt occupies `ARMO_PART` `"skirt"` with `shadows: null`, leaving groin skin drawn underneath; clothing skirts reserve slots at higher priority and override the plate skirt and greaves. First-person arms consume `fpShadows` (`shadowSkinRows`), so a hidden body part whose `under` mesh is absent in first person (such as upper arm under a pauldron) stays visible.
- **Closed and open helm switch (`src/characters/ownArmorModels.js`, `src/mods/features.js`, `src/ui/enhancedMenu.js`, `src/characters/headPortraits.js`):** `STEEL_HELM_STYLES = ["closed", "open"]` defaults to `STEEL_HELM_DEFAULT = "closed"` (`mwSteelHelm` pref). `ownArmorParts(own, { helmStyle })` picks `steel_plate_helm_closed.nif` (occupies `"hair"`, hides `["head"]`) or `steel_plate_helm_open.nif` (hides nothing). `TILE_AFTER.mwSteelHelm = rebuildMorrowindBody` runs `buildArmsFor(playerEntity)` and `render()`, while `headPortraits.js` couples cache keys to `getPref("mwSteelHelm")` without wire traffic.
