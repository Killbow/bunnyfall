---
slug: "layered-gearing-overview"
title: "Layered Gearing: Paperdoll-Driven Sprite Armor, Cloaks, and Hood Strips"
domain: "characters"
kind: "overview"
parent: null
files:
  - "src/player/layeredArmor.js"
  - "src/ui/skinCard.js"
  - "src/mods/modSettings.js"
  - "src/player/eotbBody.js"
  - "tools/layered-armor/build_hoodfix.mjs"
  - "tools/layered-armor/strips_from_frames.py"
  - "tools/layered-armor/fix_hood_holes.py"
  - "tools/layered-armor/fix_female_hood_shoulders.py"
  - "tools/layered-armor/fix_mace_head.py"
  - "tools/layered-armor/build_cloak.py"
  - "vendor/layered-armor/manifest.json"
routes: []
tables: []
replacesBible:
  - "04-Characters/Layered-Gearing.md"
related:
  - "layered-gearing-wire-and-peer-walkers"
  - "peer-art-lru-sweep-and-boat-arc-glide"
invariants:
  - "`Graphics.LayeredGear` (Eye of the Beholder) is `0` (`Skins`), `1` (female), `2` (male), or `3` (`LAYERED_OWN`, the default, clamped `0..3`)."
  - "Only chest, legs, and helmet slots change the layered sprite (`empty` draws as leather); plate tiers tint for iron, steel, mithril, adamantium, ebony, orcish, and daedric, while silver, elven, and dwarven draw as steel."
  - "Casual Cloak (templates `154`, `191`) and Formal Cloak (templates `155`, `192`) add a hood and cape tinted via `dyeCloth` (undyed defaults to Light Brown), with `applyCloak` drawing over the helmet and `closeHoodFoot` sealing gaps below the hood rim."
traps:
  - "Riders and beast forms (werewolves and wereboars) lack layered art and fall back to Mounted or beast sprites (with On-foot skin fallback for missing frames)."
  - "`decodeLayered` loads hoodfix strips only when a cloak is worn and draws without `applyHoodFix` if strips are absent; `releaseOutfits` (`src/player/eotbBody.js`) frees prior outfit textures on equip."
dfu: []
tags:
  - "layered-gear"
  - "eye-of-the-beholder"
  - "skin-card"
  - "cloak"
---

# Layered Gearing: Paperdoll-Driven Sprite Armor, Cloaks, and Hood Strips

Layered Gearing composites Eye of the Beholder sprites in `src/player/layeredArmor.js` and `src/player/eotbBody.js`. `Graphics.LayeredGear` (`src/mods/modSettings.js`) is `0` (`Skins`), `1` (female), `2` (male), or `3` (`LAYERED_OWN`, default, clamped `0..3`). The `src/ui/skinCard.js` toggle writes `0` or `layeredBodyToWear()`, and `layeredPreviewUrl` previews plain leather.

- **Slots and tints:** Only chest, legs, and helmet slots change the sprite (`empty` draws as leather). Plate tints for iron, steel, mithril, adamantium, ebony, orcish, and daedric; silver, elven, and dwarven draw as steel.
- **Cloaks and hood strips:** Casual Cloak (`154`, `191`) and Formal Cloak (`155`, `192`) add a hood and cape tinted via `dyeCloth` (undyed defaults to Light Brown), with `applyCloak` over the helmet and `closeHoodFoot` sealing gaps. `decodeLayered` loads hoodfix strips under `vendor/layered-armor/{male,female,cloak,hoodfix}` (built by `strips_from_frames.py`, `fix_female_hood_shoulders.py`, `fix_hood_holes.py`, and `build_hoodfix.mjs`) only when a cloak is worn, skipping `applyHoodFix` if absent.
- **Fallbacks and cleanup:** Riders and beast forms (werewolves and wereboars) use Mounted or beast sprites (with On-foot frame fallback), and `releaseOutfits` frees old outfit textures on equip.
