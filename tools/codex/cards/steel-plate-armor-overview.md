---
slug: "steel-plate-armor-overview"
title: "Steel Plate: Custom Morrowind Steel Armor Set"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/characters/ownArmorModels.js"
  - "src/formats/mwItemMap.js"
  - "src/formats/ownMwAssets.js"
  - "tools/bakeSteelPlate.mjs"
  - "src/assets/mw/source/Steel_Plate.fbx"
  - "src/assets/mw/source/Steel_Plate_Open_Helm.fbx"
routes: []
tables: []
replacesBible:
  - "04-Characters/Steel-Plate.md"
related:
  - "steel-plate-bake-and-retail-bind"
  - "steel-plate-worn-slots-and-helm-switch"
  - "characters-paperdoll-and-bodies"
  - "wardrobe-drawn-piece-rendering"
  - "morrowind-npc-bodies-overview"
  - "mw-gpu-skinning-and-sprite-batch"
invariants:
  - "Only the seven classic Steel pieces wear the custom plate (`CLASSIC_ARMOR_TEMPLATE`: Cuirass `102`, Gauntlets `103`, Greaves `104`, Left_Pauldron `105`, Right_Pauldron `106`, Helm `107`, and Boots `108`)."
  - "Silver and Elven armor stay on retail Morrowind steel via `DF_TO_MW_ARMOR_MATERIAL` (`Silver: [\"steel\"]`, `Elven: [\"steel\"]`)."
  - "Steel plate ships pre-skinned (`steelPlate()` in `src/characters/ownArmorModels.js`), so models carry no `skinFrom` or `fitTo` metadata and bind directly like retail parts."
traps:
  - "Source comments still cite retired paths (`systems/features.js`, `ui/enhanced/enhancedMenu.js`, `test/...`); live files are `src/mods/features.js` and `src/ui/enhancedMenu.js`."
dfu: []
tags:
  - "morrowind"
  - "armor"
  - "steel-plate"
  - "own-models"
  - "nif"
  - "overview"
---

# Steel Plate: Custom Morrowind Steel Armor Set

The custom Steel Plate set (`steelPlate()` in `src/characters/ownArmorModels.js`, with record IDs such as `daggerfall_steel_cuirass`) replaces Morrowind meshes for the seven classic Steel pieces (`CLASSIC_ARMOR_TEMPLATE` in `src/formats/mwItemMap.js`: Cuirass `102`, Gauntlets `103`, Greaves `104`, Left_Pauldron `105`, Right_Pauldron `106`, Helm `107`, and Boots `108`).

- **Material scope and pre-skinned binding (`src/formats/mwItemMap.js`, `src/characters/ownArmorModels.js`):** The cuirass also wears the plate skirt. Silver and Elven armor stay on retail Morrowind steel via `DF_TO_MW_ARMOR_MATERIAL` (`Silver: ["steel"]`, `Elven: ["steel"]`). A sibling Ebony set follows the same pattern. Because Steel Plate ships pre-skinned, models carry no `skinFrom` or `fitTo` metadata and bind directly like retail parts.
- **Shipped assets and source paths (`src/formats/ownMwAssets.js`, `tools/bakeSteelPlate.mjs`):** `ownMwAssets.js` mounts `src/assets/mw/` as a Data Files tree, serving 12 NIFs under `src/assets/mw/meshes/steel_plate_*.nif` (`cuirass`, `skirt`, `pauldron`/`gauntlet`/`greave`/`boot` left and right, `helm_closed`, `helm_open`) and 8 DDS textures under `src/assets/mw/textures/steel_plate_*.dds` (`boot`, `cuirass`, `gauntlet`, `greave`, `helm`, `pauldron`, `skirt`, `visor`) baked from `src/assets/mw/source/Steel_Plate.fbx`, `Steel_Plate_Open_Helm.fbx`, and eight `Steel_Plate_*.png` paintings. Source comments still cite retired paths (`systems/features.js`, `ui/enhanced/enhancedMenu.js`); live files are `src/mods/features.js` and `src/ui/enhancedMenu.js`.
