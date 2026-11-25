---
slug: "werewolf-shadow-fang-skin"
title: "Shadow Fang Werewolf Skin: Build-Time Mip Painting and Glyph Gate"
domain: "characters"
kind: "subcard"
parent: "werewolf-body-overview"
files:
  - "src/characters/werewolfSkin.js"
  - "src/combat/fpArm.js"
  - "src/net/accountClient.js"
  - "src/characters/ownGlyphs.js"
  - "src/ui/playerBadge.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Werewolf-Body.md"
related:
  - "werewolf-body-overview"
  - "wallet-weight-glyphs-and-raid-lairs-overview"
invariants:
  - "Shadow Fang recolors only the Bloodmoon wolf body at build time via `preskinTextures` (`src/characters/werewolfSkin.js`), cached in `SKINNED_MIPS` (`WeakMap`) by `skinUseKey`, and never alters human bodies or item icons."
  - "`SHADOW_FANG` applies `dark: 0.3`, `drain: 0.4`, tip quantiles `[0.85, 0.97]`, crimson `#c41230`, and eye `#ff222e` (shared with `src/ui/playerBadge.js`)."
traps:
  - "Recoloring runs on mip `0` only, and lower mip levels downsample from mip `0` using alpha-weighted box filtering."
  - "Eye recoloring triggers only on eye-named textures or `eyeBlob` matches (lift `0.3`), keeping pupils dark."
dfu: []
tags:
  - "werewolf"
  - "skin"
  - "glyph"
  - "shadow-fang"
---

# Shadow Fang Werewolf Skin: Build-Time Mip Painting and Glyph Gate

The Shadow Fang cosmetic recolors only the Bloodmoon 3D werewolf body at build time while leaving human bodies, wereboars, and inventory icons untouched.

## Mip Painting and Eligibility

- **Build-Time Texture Cache**: When building a werewolf rig in `src/combat/fpArm.js`, `preskinTextures` in `src/characters/werewolfSkin.js` transforms the wolf textures and stores the resulting mip chains inside the `SKINNED_MIPS` `WeakMap` keyed by `skinUseKey`.
- **Palette Constants**: The frozen `SHADOW_FANG` object applies `dark: 0.3`, `drain: 0.4`, fur-tip quantiles `[0.85, 0.97]`, crimson edging `#c41230`, and eye glow `#ff222e` (a color constant shared with `src/ui/playerBadge.js`).
- **Mip Downsampling and Eye Filter**: Fur and eye recoloring execute on mip `0` only, after which lower mip levels downsample from the painted mip `0` buffer using alpha-weighted box filtering. Eye recoloring triggers only on eye-named textures or `eyeBlob` region matches (with lift `0.3`), preserving dark pupils.
- **Glyph Verification**: Skin eligibility evaluates only on form change from relay-signed peer tokens or local session glyphs via `adoptIdentity` in `src/net/accountClient.js` and `src/characters/ownGlyphs.js`.
