---
slug: weapon-glow-overview
title: "Weapon Glow: Elemental and Arcane Outlines in the Hand"
domain: combat
kind: overview
parent: null
files:
  - src/combat/weaponGlow.js
  - src/items/lootRarity.js
  - src/items/inventory.js
  - src/mods/features.js
  - src/combat/weaponRig.js
  - src/render/weaponGlowGlsl.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Glow.md"
related:
  - weapon-glow-classic-sprite-and-morrowind-rings
  - weapon-glow-look-wire-and-peer-bodies
  - loot-arc-drop-rates-renown-and-loot-lines
  - loot-ii-reforge-honing-scry-and-sockets
  - wardrobe-drawn-piece-rendering
  - two-hands-overview
invariants:
  - "The element comes only from a weapon's `elemental` affix lines, rolled or socketed, read via readLines/validAffix. Legendary innate powers and cast-when-strikes spells never name an element."
  - "Only one element shows: the largest total, with ties going in PROC_ELEMENTS order (fire, frost, shock)."
  - "Strength comes from the total via GLOW_LEVEL_EDGES [3, 6]: up to 3 is level 1, up to 6 is level 2, above 6 is level 3. Rarity tier does not matter."
  - "An unidentified piece (rarityKnown false) shows no element."
  - "Arcane (fixed at ARCANE_LEVEL 2) shows only on the Morrowind hand (meshGlow, arcane true), for an isEnchanted weapon that shows no element. The loot ladder switch does not affect it."
  - "Specs are frozen once per look and level (glowSpec), so the per-frame path allocates nothing."
traps:
  - "Turning the loot ladder off hides elements but not arcane or the classic WEAPO1xx magic sheet."
  - "Aetheric or Gilded pieces with no elemental line carry no DFU enchantment, so they swing bare on both hands."
dfu:
  - "Assets/Scripts/Game/Items/ItemHelper.cs"
tags:
  - weapon-glow
  - combat
  - rendering
  - loot
  - elemental
---

# Weapon Glow: Elemental and Arcane Outlines in the Hand

`src/combat/weaponGlow.js` computes elemental and arcane outlines for held weapons across classic 2D sprite hands and Morrowind 3D weapon rigs. All four scene hosts (`src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/dungeonContext.js`, and `src/scenes/worldModes.js`) build their weapon rigs through `createWeaponRig` in `src/combat/weaponRig.js`.

## Element Selection and Levels

- `weaponElement` reads rolled and socketed `elemental` affix lines via `readLines` and `validAffix` (`src/items/lootRarity.js`). Legendary innate powers and cast-when-strikes spells never assign an element, and unidentified items (`rarityKnown: false`) show no element.
- Only one element displays: the highest total wins, breaking ties in `PROC_ELEMENTS` order (`fire`, `frost`, `shock`).
- Strength maps from the element total across `GLOW_LEVEL_EDGES` (`[3, 6]`): totals up to `3` yield level `1`, up to `6` yield level `2`, and above `6` yield level `3`, independent of rarity tier.

## Arcane Fallback, Palettes, and Feature Switches

- `GLOW_LOOKS` (`['none', 'fire', 'frost', 'shock', 'arcane']`) and `GLOW_CODE` index the shader uniform `uGlowLook` (`src/render/weaponGlowGlsl.js`), while `GLOW_RAMPS` defines four linear-RGB color stops per look.
- `spriteGlow` drives classic sprites and `meshGlow` drives Morrowind 3D hands. When a weapon has no element but is enchanted (`isEnchanted` in `src/items/inventory.js`), `meshGlow` falls back to `arcane` at `ARCANE_LEVEL` (`2`), while classic sprites use the `WEAPO1xx` magic sheet.
- `glowSpec` returns pre-frozen specs so per-frame queries allocate nothing, while `glowWord` and `glowFromWord` serialize look tokens.
- The `weaponGlow` feature preference (`WEAPON_GLOW_PREF` in `src/mods/features.js`, enabled by default) and the `?weaponglow=off` URL query parameter disable all weapon glow rendering.
