---
slug: loot-rarity-affix-lines-and-armor-lean
title: "Affix Rolls, Line-Weighted Draws, Armor Lean, and Folding"
domain: items
kind: subcard
parent: loot-rarity-ladder-overview
files:
  - src/items/lootRarity.js
  - src/characters/entityMods.js
  - src/combat/formulas.js
  - src/net/productRecord.js
  - src/professions/smithItems.js
  - src/magic/enchanting.js
  - src/trade/tradeModes.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Rarity.md"
related:
  - loot-rarity-ladder-overview
  - loot-arc-overview
  - professions-crafting-provenance-and-master-art
  - weapon-technique-roster-and-affix-line
invariants:
  - "`AFFIX_COUNTS` magic [1, 2], rare [3, 4]; Legendary lines come from its record; no kind (or kind:param) repeats."
  - "AFFIX-LINES: `pickByLines` weighs each kind by `kindLines` (free params), times `ARMOR_LEAN` kind weight via `drawWeight`; Rare names follow whatever lines fell (`nameAround`)."
  - "Non-weapon affixes fold onto entity mods via `affixFold` under `LOOT_RARITY_FOLD`; armor points land only on `armorBodyParts` the piece covers; weapon `damage` goes through `affixWeaponDamage` via `registerWeaponDamageMod`."
  - "`validAffix` requires an own `AFFIX_KINDS` row, a legal param, and an integer value in [1, Legendary max]."
traps:
  - "Never renumber `MINT_V_LINES` (2) or `MINT_V_ARMOR_LEAN` (3) in `src/net/productRecord.js`; older records re-mint with `byLines`/`lean` false."
  - "`rareKeeps` lets only an identified Rare (not magic, not artifact) into the item maker keeping its flavor free; unidentified Rares, Legendaries and Artifacts are refused."
  - "`counterValueOf` halves Daedric weapons, plate and shields (`DAEDRIC_SALE_SHARE` 0.5) on the sell side only; shop asking price stands."
dfu: []
tags:
  - affixes
  - armor-lean
  - affix-lines
  - crafting
  - entity-mods
---

# Affix Rolls, Line-Weighted Draws, Armor Lean, and Folding

Rolled items draw non-repeating affix lines weighted by parameter breadth and armor family lean, then fold those modifiers into entity stats and combat formulas (`src/items/lootRarity.js`, `src/characters/entityMods.js`, `src/combat/formulas.js`).

- **Line Counts, Ranges, and Armor Lean (`src/items/lootRarity.js`, `src/net/productRecord.js`, `src/professions/smithItems.js`):** `AFFIX_COUNTS` grants `[1, 2]` lines on Magic and `[3, 4]` on Rare, while Legendary items use fixed record lines without repeating any `kind` or `kind:param`. `AFFIX_RANGES` spans `5-12` / `10-25` / `20-40` percent for `damage`, `3-6` / `6-12` / `12-20` for `armor`, `10-20` / `20-35` / `35-50` percent for `weight` and `resist` (capped at `RESIST_CAP = 45` per element), `2-5` / `5-10` / `10-15` for `stat`, and `5-10` / `10-20` / `20-30` for `skill`. `pickByLines` weights each kind by free `kindLines` times `ARMOR_LEAN` via `drawWeight` (Leather triples `agility` and `speed`; Chain doubles `resist`; Plate triples `armor`, `strength`, and `endurance`; `skill` has no lean), and `nameAround` titles Rare drops from rolled lines. `MINT_V_LINES` (`2`) and `MINT_V_ARMOR_LEAN` (`3`) preserve legacy crafted re-mints.
- **Validation, Folding, Enchanting, and Trade (`src/characters/entityMods.js`, `src/combat/formulas.js`, `src/magic/enchanting.js`, `src/trade/tradeModes.js`):** `validAffix` checks `AFFIX_KINDS`, legal params, and integer values in `[1, Legendary max]`. `affixFold` applies non-weapon mods under `LOOT_RARITY_FOLD` (restricting armor points to covered `armorBodyParts`), while `affixWeaponDamage` registers via `registerWeaponDamageMod`. In enchanting, `rareKeeps` accepts only identified Rare items; in trade, `counterValueOf` multiplies player sale value of Daedric weapons, plate, and shields by `DAEDRIC_SALE_SHARE` (`0.5`).
