---
slug: wardrobe-look-catalogue-and-kinds
title: "Look Catalog, Kinds, and the Inventory Sweep"
domain: items
kind: subcard
parent: wardrobe-appearances-overview
files:
  - src/net/appearanceLaw.js
  - src/items/appearances.js
  - src/items/armorMaterials.js
  - src/trade/shopStock.js
  - src/ui/hud.js
  - src/ui/collections/appearancesPart.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Wardrobe.md"
related:
  - wardrobe-appearances-overview
  - wardrobe-counter-fee-and-preview
invariants:
  - "`ALL_LOOKS` contains exactly `473` appearances generated from `LOOK_TEMPLATES` (templates `102` through `130` in `APPEARANCE_KINDS`, excluding arrows) ordered by `LOOK_KIND_ORDER`."
  - "Armor appearances span `ARMOR_LOOK_MATERIALS` (Leather, Chain, and ten plate metals starting at Iron), while weapon appearances span `WEAPON_LOOK_MATERIALS` (ten weapon metals `0` through `9`)."
  - "An item can adopt only a look of the same equipment kind (`pieceKind` must match the kind of the look), which is fixed by template and item group."
  - "`noteHeldLooks` replaces `entity.appearances` with a freshly sorted array in `ALL_LOOKS` order rather than mutating the existing array in place."
traps:
  - "Style `2` of chain boots (`108.256.2`) is excluded by `neverMinted` because `randomizeArmorVariant` (`src/trade/shopStock.js`) rolls boot variants only for plate armor, and loot, corpses, and smiths never mint it."
  - "`Chain2` (`0x0103`) normalizes to `Chain` (`0x0100`) as a look material; always compare appearances through `lookCode` rather than raw `material` values."
  - "Roleplay and Realism Items templates (`513` through `526`) cannot be collected as looks, though templates `513` and `515` through `526` can wear classic looks of their kind; template `514` maps to `'lightFlail'`, which is omitted from `LOOK_KIND_ORDER` and offers no looks."
dfu: []
tags:
  - wardrobe
  - catalog
  - kinds
  - collection
  - save
---

# Look Catalog, Kinds, and the Inventory Sweep

`src/net/appearanceLaw.js` and `src/items/appearances.js` build the deterministic 473-look catalog (`ALL_LOOKS`) and sweep held equipment into `entity.appearances`.

## Catalog Construction and Look Codes

- **Look keys and variants (`src/net/appearanceLaw.js`, `src/items/armorMaterials.js`):** Every appearance is identified by `lookCode` in `t.m.v` format (`template.material.variant`), validated by `lookOfKey` and `isLook`. `LOOK_VARIANTS` defines per-template variant counts (`102: 5`, `103: 2`, `104: 7`, `105: 5`, `106: 5`, `107: 6`, `108: 3`), clamped through `clampArmorVariant`. Plate cuirasses draw `3` styles, helms draw `6` styles across every material, and shields and weapons draw `1` style each.
- **Template totals (`473` total across `LOOK_TEMPLATES` `102-130`):** Helms contribute `72` looks, greaves (`legs`) `43`, cuirasses and pauldrons (`arms`) `32` each, boots `22` (after `neverMinted` drops unobtainable chain boot variant `108.256.2`), gauntlets `12`, each of the four shields `12`, and each of the `18` weapon templates `10`.

## Inventory Collection Sweep

`noteHeldLooks` (`src/items/appearances.js`) inspects `entity.items`, `wagonItems`, and `bagItems` for valid armor and weapons. It runs once per frame from `drawHud` (`src/ui/hud.js`) and again when the Wardrobe window opens. A per-item read signature caches inspected items so each object is evaluated only once unless mutated. Legacy saves lacking `appearances` initialize from an empty `Set` and populate on the first sweep, writing a new `ALL_LOOKS`-ordered array to `entity.appearances`.
