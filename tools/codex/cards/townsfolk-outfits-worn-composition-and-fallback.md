---
slug: "townsfolk-outfits-worn-composition-and-fallback"
title: "Townsfolk Outfits Worn: Slot Priority, Hidden Skin, Modesty, and Fallback"
domain: "characters"
kind: "subcard"
parent: "townsfolk-outfits-overview"
files:
  - "src/characters/ownClothingModels.js"
  - "src/formats/mwItemMap.js"
  - "src/combat/fpArm.js"
  - "src/net/peerBodies.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Townsfolk-Outfits.md"
related:
  - "townsfolk-outfits-overview"
  - "characters-paperdoll-and-bodies"
invariants:
  - "`composeWornArmor` (`src/formats/mwItemMap.js`) labels an outfit `outfit (<id>)` (`isOutfitSlot`) without claiming armor slots, so worn armor always overrides it."
  - "Each outfit `hides` array suppresses fully covered `ARMO_PART` skin, and archive `398` declares `covers: [\"chest\"]` for `composeWornModest`."
  - "If an outfit binds zero meshes, the builder drops it, rebuilds the body without it, and logs `outfit <id>: none of it bound - drawn without it`."
traps:
  - "381-383 hide only the groin; 398 leaves knees visible because its side hem rises to 29.4."
  - "A hood that binds nothing restores hair through capsHead and bareHeadRows in src/combat/fpArm.js."
  - "A `composeWornArmor` note about a piece must start with its untranslated label (`outfit <id>:`, `armor <template>:`, or the garment name), because `wornVerdicts` in `src/combat/fpArm.js` matches notes to pieces by that prefix."
dfu: []
tags:
  - "wardrobe"
  - "paperdoll"
  - "modesty"
  - "fallback"
---

# Townsfolk Outfits Worn: Slot Priority, Hidden Skin, Modesty, and Fallback

When assembling a third-person body, `src/formats/mwItemMap.js` and `src/combat/fpArm.js` layer townsfolk outfits beneath equipped armor while pruning covered body segments and recovering cleanly from missing meshes.

## Slot Priority, Skin Culling, and Fallback

- **Non-Claiming Outfit Slot**: In `src/formats/mwItemMap.js`, `composeWornArmor` tags a townsfolk garment as `outfit (<id>)` (`isOutfitSlot`) without claiming standard armor slots, ensuring worn armor pieces always override the base outfit. Outfits apply only in third person; werewolf forms, beast races, and unknown identifiers receive none.
- **Hidden Skin and Modesty**: Each entry in `src/characters/ownClothingModels.js` defines a `hides` list that suppresses covered `ARMO_PART` skin meshes. Outfits `381` through `383` hide only the groin, whereas archive `398` declares `covers: ["chest"]` for `composeWornModest` and leaves knees visible because its side hem rises to `29.4`. Hooded outfits `388`, `389`, and `398` hide `hair` like a helmet.
- **Unbound Mesh Recovery**: If an outfit binds zero meshes, the builder drops the outfit, rebuilds the body without it, and logs `outfit <id>: none of it bound - drawn without it`. When a hood binds nothing, `capsHead` and `bareHeadRows` in `src/combat/fpArm.js` restore the character hair.
