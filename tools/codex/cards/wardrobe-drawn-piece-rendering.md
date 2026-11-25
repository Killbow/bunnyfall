---
slug: wardrobe-drawn-piece-rendering
title: "Drawn Pieces: How Renderers Show a Look"
domain: rendering
kind: subcard
parent: wardrobe-appearances-overview
files:
  - src/net/appearanceLaw.js
  - src/combat/shieldWidget.js
  - src/combat/weaponRig.js
  - src/combat/fpArm.js
  - src/combat/diverseWeapons.js
  - src/net/peerBodies.js
  - src/formats/mwItemMap.js
  - src/player/layeredArmor.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Wardrobe.md"
related:
  - wardrobe-appearances-overview
  - wardrobe-wire-and-receiver-marks
  - characters-paperdoll-and-bodies
  - morrowind-npc-bodies-overview
invariants:
  - "`drawnPiece(item)` returns `item` unchanged when no valid look applies, or a single memoized copy per `(item, look)` pair that is rebuilt only when a `DRAWN_WATCH` field changes so identity-comparing weapon renderers stay stable."
  - "The memoized copy adopts `templateIndex`, `material`, and `variant` from the look, preserves `enchantments` and `glow`, and strips `appearance`, `ap`, `dyeColor`, `artifact`, `playerTextureArchive`, `playerTextureRecord`, and `gilded` (downgrading `'gilded'` rarity)."
  - "`drawnPiece` output is restricted to visual rendering paths and must never feed into combat calculations, durability, or gold value math."
traps:
  - "`src/combat/shieldWidget.js` draws the sprite from `drawnPiece`, but calculates covered body parts from `coverTemplate` (the base template of the equipped shield)."
  - "`heldWeaponKey` (`src/combat/weaponRig.js`, `src/combat/fpArm.js`) must include `templateIndex`, `material`, `equipSlot`, and `appearanceSig` so changing the look on an already drawn weapon triggers a re-render."
  - "`isArtifact` in `src/combat/diverseWeapons.js` excludes `isLookCopy` objects so a transmogrified weapon never triggers artifact sprite-sheet overrides."
dfu: []
tags:
  - wardrobe
  - rendering
  - transmog
  - shield
  - weapon-glow
---

# Drawn Pieces: How Renderers Show a Look

Visual subsystems render an item's active Wardrobe appearance by passing the equipped item through `drawnPiece` in `src/net/appearanceLaw.js` while leaving combat and economy logic bound to the underlying item record.

## Memoized Copy Rules and Signatures

- **Identity memoization (`drawnPiece` in `src/net/appearanceLaw.js`):** When an item carries no valid `appearance` or wire `ap`, `drawnPiece(item)` returns `item` directly. Otherwise it returns a memoized clone registered in a `WeakSet` (`isLookCopy`) and refreshes the clone only when a watched property in `DRAWN_WATCH` changes, preserving object reference identity across frames.
- **Overridden, preserved, and stripped fields:** The clone takes `templateIndex`, `material`, and `variant` from the look and preserves `enchantments` and `glow` (so weapon enchantment glow renders over the active look). It strips `appearance`, `ap`, `dyeColor`, `artifact`, `playerTextureArchive`, `playerTextureRecord`, and `gilded` (clearing `'gilded'` rarity).
- **Cache signatures (`appearanceSig`):** `appearanceSig(item)` returns the active look key (`t.m.v`) or `''`, allowing `src/net/peerBodies.js`, `src/ui/wardrobe/wardrobePreview.js`, and weapon rigs to invalidate cached meshes when an appearance changes.

## Renderer Integrations

`drawnPiece` drives first-person weapon rigs (`src/combat/weaponRig.js`, `src/combat/fpArm.js`, `src/combat/diverseWeapons.js`), the HUD shield widget (`src/combat/shieldWidget.js`, which still reads `coverTemplate` from the base item for hit coverage), 3D Morrowind equipment mapping (`src/formats/mwItemMap.js`), Eye of the Beholder armor (`src/player/layeredArmor.js`), head portraits, enemy bodies, and remote player bodies.
