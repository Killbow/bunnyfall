---
slug: wardrobe-appearances-overview
title: "Wardrobe: Collected Appearances and Transmog"
domain: items
kind: overview
parent: null
files:
  - src/net/appearanceLaw.js
  - src/items/appearances.js
  - src/items/wardrobeCounter.js
  - src/ui/wardrobe/wardrobeWindow.js
  - src/ui/wardrobe/wardrobePreview.js
  - src/ui/collections/appearancesPart.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Wardrobe.md"
related:
  - wardrobe-look-catalogue-and-kinds
  - wardrobe-counter-fee-and-preview
  - wardrobe-drawn-piece-rendering
  - wardrobe-wire-and-receiver-marks
  - characters-paperdoll-and-bodies
  - loot-ii-resist-cap-luck-and-wardrobe
invariants:
  - "An applied look is strictly cosmetic: combat damage, armor rating, enchantments, gold value, audio, and inventory icons read the underlying item, while only visual renderers read `drawnPiece`."
  - "A character unlocks every valid armor and weapon appearance held in inventory automatically; the character collection (`entity.appearances`) is stored separately from the `appearance` field on any individual item."
  - "`src/net/appearanceLaw.js` is shared between the client and the multiplayer relay and imports only the leaf module `src/items/armorMaterials.js`."
traps:
  - "Do not confuse the Wardrobe appearance transmog system with the Loot II garment affix pool (`wardrobePass`) or the NPC outfit generator in `src/characters/wardrobe.js`."
dfu: []
tags:
  - wardrobe
  - appearances
  - transmog
  - cosmetic
  - horizontal-progression
---

# Wardrobe: Collected Appearances and Transmog

The Wardrobe system lets characters collect armor and weapon appearances (`entity.appearances`) and apply those looks (`item.appearance`) at participating shops without altering item stats, icons, or mechanics (`src/net/appearanceLaw.js`, `src/items/appearances.js`, and `src/items/wardrobeCounter.js`).

## Module Boundaries and Core Rules

- **Shared appearance rules (`src/net/appearanceLaw.js`):** Defines equipment kinds (`APPEARANCE_KINDS`, `LOOK_KIND_ORDER`), the 473-entry catalog (`ALL_LOOKS`), look resolution (`appearanceOf`), renderer substitution (`drawnPiece`), and relay payload validation (`validWireAppearance`). It depends only on `src/items/armorMaterials.js`.
- **Collection and application (`src/items/appearances.js`):** `noteHeldLooks` scans held items to populate `entity.appearances`. `wardrobeFee` computes the gold cost to apply a look, `wearAppearance` writes `item.appearance = { t, m, v }`, `clearAppearance` restores the base look of a piece at no cost, `previewWearer` builds a temporary try-on proxy, and `lookLine` formats the `'Looks like {name}'` line appended to item Info popups (while inventory slot icons continue to show the base item).
- **Exclusions (`lookOfPiece`):** Artifacts and Gilded items return `null` from `lookOfPiece`; they are never added to the appearance catalog, and no other piece can adopt their appearance.
- **Shop and Collections UI (`src/items/wardrobeCounter.js`, `src/ui/wardrobe/wardrobeWindow.js`, `src/ui/wardrobe/wardrobePreview.js`, `src/ui/collections/appearancesPart.js`):** `createWardrobeCounter` exposes `{ row, open, wear, clear }` for merchant service dialogs, while `appearancesPart.js` renders collected progress in the Collections book from `lookGroups` and `looksCount`.
