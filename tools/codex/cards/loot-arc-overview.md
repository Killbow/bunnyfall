---
slug: loot-arc-overview
title: "Loot Arc: Rarity Depth, Chase, and Endgame Loop"
domain: items
kind: overview
parent: null
files:
  - src/items/lootRarity.js
  - src/items/lootPowers.js
  - src/items/lootDrought.js
  - src/items/lootCodex.js
  - src/characters/champions.js
  - src/items/reforge.js
  - src/items/lootLines.js
  - src/net/productRecord.js
  - src/ui/enhancedPlusStyle.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Arc.md"
related:
  - loot-arc-legendary-powers-and-proc-caps
  - loot-arc-signature-drops-champions-and-drought
  - loot-arc-welkynd-salvage-reforge-and-imprint
  - loot-arc-drop-rates-renown-and-loot-lines
  - loot-ii-arc-overview
  - weapon-technique-roster-and-affix-line
invariants:
  - "When `lootRarityOn()` is false, every Loot Arc entry point preserves classic DFU behavior: items mint without rarity fields, the drought multiplier stays at `1`, loot beacons do not render, and salvage, reforge, and imprint return `'off'`."
  - "Skill affix draws weight toward an active skill of the character at `SKILL_OWN_SHARE = 0.5` and toward related kinship skills at `SKILL_KIN_SHARE = 0.85` cumulative."
  - "Each minted Legendary rolls `EXALTED_PER_MILLE = 100` to become an Exalted variant (not a separate rarity tier), adding one upper-half Legendary-band affix and `EXALTED_WORTH = 1000` gold value (halved on garments by `exaltedWorth`)."
  - "The catalog defines 30 standard `LEGENDARIES` records, 3 `ARCANE_LEGENDARIES` records, and 30 `LEGENDARY_POWERS` entries."
traps:
  - "Never renumber crafted item schema constants in `src/net/productRecord.js` (`MINT_V_LINES = 2`, `MINT_V_JEWEL_KIN = 4`), because they control how saved crafted records re-mint their affix lines."
  - "`EXALTED_PIPS` in `src/ui/enhancedPlusStyle.js` is a UI pip display string rather than a drop-roll constant."
dfu: []
tags:
  - loot
  - rarity
  - legendary
  - exalted
  - loot-arc
---

Loot Arc (`LOOT1` through `LOOT11`) builds the rarity and endgame progression loop around `lootRarityOn()`: skill-weighted affix rolls, Exalted Legendary variants, combat proc affixes, unique Legendary powers, family signature drops, champion enemies, drought protection, Welkynd Shard salvage, affix reforging, power imprinting, and world loot beacons.

## Affix Kinship, Active Lines, and Exalted Variants

In `src/items/lootRarity.js`, skill-granting affixes weight toward the character's primary skills at `SKILL_OWN_SHARE` (`0.5`) and related skill groups at `SKILL_KIN_SHARE` (`0.85` cumulative), with crafted item re-minting versioned by `MINT_V_LINES` (`2`) and `MINT_V_JEWEL_KIN` (`4`) in `src/net/productRecord.js`. Magic and Rare drops roll an active combat proc affix at `PROC_PER_MILLE` (`200` for Magic, `350` for Rare).

Named items draw from 30 `LEGENDARIES` and 3 `ARCANE_LEGENDARIES` paired with 30 `LEGENDARY_POWERS` (`src/items/lootPowers.js`). At mint time, `EXALTED_PER_MILLE` (`100`) upgrades a Legendary into an Exalted variant (marked in UI by `EXALTED_PIPS` in `enhancedPlusStyle.js`), rolling one extra upper-half Legendary-band line and adding `EXALTED_WORTH` (`1000`, scaled on clothing by `exaltedWorth`). When players reroll a line at a reforge station (`src/items/reforge.js`), `reforgePool` excludes the current affix kind, any kind already present on the item, and socketed gem lines.

## Subcards

- `loot-arc-legendary-powers-and-proc-caps`: proc categories, unique power deduplication, duel exclusions, and stat caps.
- `loot-arc-signature-drops-champions-and-drought`: enemy families, champion traits, and bad-luck drought scaling.
- `loot-arc-welkynd-salvage-reforge-and-imprint`: shard salvage yields, fixed reforge pricing, and codex imprinting.
- `loot-arc-drop-rates-renown-and-loot-lines`: non-elite drop retention, Renown quarters, and 3D loot line beacons.
