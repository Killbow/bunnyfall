---
slug: "townsfolk-outfits-overview"
title: "Townsfolk Outfits: Morrowind-Body Walker Garments by Sprite Archive"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/characters/ownClothingModels.js"
  - "src/characters/folkBodies.js"
  - "src/characters/rosterBodies.js"
  - "src/characters/wardrobe.js"
  - "src/net/peerBodies.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Townsfolk-Outfits.md"
related:
  - "characters-paperdoll-and-bodies"
  - "townsfolk-outfits-bake-and-rigging"
  - "townsfolk-outfits-worn-composition-and-fallback"
invariants:
  - "`TOWNSFOLK_OUTFITS` (`src/characters/ownClothingModels.js`) defines eleven outfits keyed by walker sprite archive (`381` to `390` and `398`)."
  - "`townsfolkOutfitOf(archive)` returns `null` for unmapped archives so those walkers dress from `wardrobe.js`."
  - "Outfit ids follow `townsfolk_<archive>` (`townsfolk_<archive>.nif`), and `ownOutfitFor` rejects ids absent from `TOWNSFOLK_OUTFITS`."
traps:
  - "Beast-race walkers on an outfit picture are dressed by the wardrobe, not the outfit."
  - "Walkers sharing a picture share an outfit but keep seed-driven faces."
dfu: []
tags:
  - "townsfolk"
  - "outfits"
  - "walkers"
  - "morrowind-body"
---

# Townsfolk Outfits: Morrowind-Body Walker Garments by Sprite Archive

Townsfolk on Morrowind 3D bodies can wear full-body garments mapped directly from their classic walker sprite archive instead of procedural wardrobe assembly.

## Archive Table and Routing

- **Archive Registry**: `TOWNSFOLK_OUTFITS` in `src/characters/ownClothingModels.js` defines eleven outfits keyed by walker sprite archive (`381` through `390`, plus `398`). Outfit identifiers use the `townsfolk_<archive>` convention (`townsfolk_<archive>.nif`), and `ownOutfitFor` rejects any identifier missing from `TOWNSFOLK_OUTFITS`.
- **Unmapped Fallback**: `townsfolkOutfitOf(archive)` returns `null` for unmapped sprite archives so those walkers dress through `src/characters/wardrobe.js`.
- **Walker, Resident, and Peer Wiring**: In `src/characters/folkBodies.js`, `folkLookOf` assigns the archive outfit whenever the sprite sex matches and the character race is non-beast. Living-world residents route through `residentLook` (`src/characters/rosterBodies.js`), while remote multiplayer peers resolve outfits through `peerBuildOpts` and `outfitKeyOf` (`src/net/peerBodies.js`).
- **Beast and Face Rules**: Beast-race walkers assigned an outfit picture bypass the garment and dress from the wardrobe instead. Walkers sharing the same sprite picture share the garment mesh while retaining distinct seed-driven faces.
