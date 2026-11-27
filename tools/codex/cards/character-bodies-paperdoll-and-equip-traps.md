---
slug: "character-bodies-paperdoll-and-equip-traps"
title: "Neutral Body, Paperdoll Templates, Cloth, and Equip Traps"
domain: "characters"
kind: "subcard"
parent: "characters-paperdoll-and-bodies"
files:
  - "src/characters/neutralBody.js"
  - "src/characters/paperdoll.js"
  - "src/characters/paperdollArt.js"
  - "src/characters/pieces/tail.js"
  - "src/characters/clothSim.js"
  - "src/characters/equip.js"
  - "src/characters/equipTable.js"
  - "src/characters/headPortraits.js"
routes: []
tables: []
replacesBible: []
related:
  - "characters-paperdoll-and-bodies"
  - "layered-gearing-overview"
  - "enemy-equipment-and-durability-traps"
invariants:
  - "`stepCloth` runs distance constraints and the anti-pop clamp before collision, and collision runs last in its own passes. Cloth then ends outside the body, and collision cannot ratchet it up the legs."
  - "`equipItem` and the equip table never check `isBrokenItem`; the broken-item refusal belongs to callers such as the inventory windows and the hotbar. A check inside `equipItem` would load a saved worn item with zero condition with its slot empty."
  - "`rebuildEquipState` does not fire the enchantment hook. `restartHeldEnchantments` re-applies held enchantments after a load restore, once the effects are the save's own."
  - "Bow hand assignment depends on `BowLeftHandWithSwitching`: a bow is `LeftOnly` when it is on and `Both` otherwise. The arrow counter in `hud.js` and `toggleHand` in `playerWeapon.js` read the same setting."
  - "Any wrist cut by height must use `WRIST_JUNCTION_Y`, not a fraction of the arm span. A cut inside the hand (y 0.738 to 0.985, before `HSCALE`) splits the mitten."
  - "The `build` option scales only `rx` and `rz`. It never changes y, because `WRIST_JUNCTION_Y`, `NECK_PIVOT_Y`, and every limb pivot derived from them are heights that would silently go stale."
  - "`getTemplate` must resolve through `templateByIndex`, never a private map built from the frozen data. A private map misses `registerCustomTemplates` and `registerTemplateOverrides`."
traps:
  - "`equipDelayFor` indexes the weapon delay table by the item's index within its own group, so a shield or armor swap reads the low weapon rows. This matches the original game."
  - "`weaponProficiencyFlag` returns `-1` (all bits set) for an unmatched weapon template, so any career with a forbidden proficiency refuses it. It must key on template index, never on item name."
  - "Female characters use the weapon archive minus one, but arrows and custom weapons are exempt. Arrows never go through that step, and a custom weapon registers a single archive with no female pair."
  - "The data store is loaded with a dynamic import on first use, and the face key reads 0 until it loads. A static import would pull it ahead of the module graph's order."
  - "The tail's dorsal axis is `X x tangent` for every ring. Choosing a sign per ring flips rings past the Khajiit tip's forward curl and pinches the tube."
dfu: []
tags:
  - "paperdoll"
  - "neutral-body"
  - "equip"
---

# Neutral Body, Paperdoll Templates, Cloth, and Equip Traps

The 3D bodies are built on the neutral rig (`src/characters/neutralBody.js`) with pieces in `src/characters/pieces/`, and draped garments are simulated by `src/characters/clothSim.js`. The 2D paperdoll reads templates through `templateByIndex` (`src/characters/paperdoll.js`) and its art through `src/characters/paperdollArt.js`.

- **Equip:** `src/characters/equip.js` ports the classic equip, armor value, and proficiency rules, and `src/characters/equipTable.js` holds the hand assignments.
- **Portraits:** `src/characters/headPortraits.js` loads the face data on first use.
