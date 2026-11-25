---
slug: economy-arc-overview
title: "Economy Arc: Influence, Friction, and Bounded Sinks"
domain: economy
kind: overview
parent: null
files:
  - src/trade/repairService.js
  - src/items/foundMark.js
  - src/net/homeLaw.js
  - src/net/hallLaw.js
  - src/net/patronLaw.js
  - src/items/lootRarity.js
  - src/characters/equip.js
  - src/characters/weapons.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Economy-Arc.md"
related:
  - economy-arc-repair-wear-and-kits
  - economy-arc-found-mark-and-mend-resale
  - economy-arc-online-home-pricing
  - economy-ledger-and-item-judge
  - town-economy-overview
  - town-economy-resale-cap-and-sea-trade
  - realm-arc-gold-law-empire-and-vendor-ceiling
  - market-vendors-and-professions
invariants:
  - "Repairs are friction that limits outings, not a gold sink: `REPAIR_COST_SCALE = 1 / 3` of DFU's repair cost, wear at `DFU_WEAR_MULTIPLE = 1`."
  - "NPC shops are the floor and crafting is the ceiling: a counter or patron never pays for what a crafted piece's quality rolled onto it (CRAFT-WORTH, `craftedRarityWorth`)."
  - "Sinks that scale with wealth are elective prestige (homes, guild halls, decor), priced by footprint between 5,000 and 250,000 gold."
traps:
  - "Tag names such as `WEAR-ONE`, `KIT-CEILING`, `MEND-THIRD` and `HOME-PRICE` are comment markers. Grep for them, but cite the constants they govern."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
tags:
  - economy
  - repairs
  - resale
  - homes
  - design-frame
---

# Economy Arc: Influence, Friction, and Bounded Sinks

The economy follows a core design rule: influence rather than control, assume infinite player wealth, and treat equipment repairs as outing friction rather than a gold sink (`src/trade/repairService.js`, `src/characters/equip.js`, `src/net/homeLaw.js`).

## Subcards and Responsibilities

- **Repairs, wear, and kits (`economy-arc-repair-wear-and-kits`):** Repair bills scale by `REPAIR_COST_SCALE = 1 / 3` (`src/trade/repairService.js`), durability wears at `DFU_WEAR_MULTIPLE = 1` (`src/characters/equip.js`), non-ammunition weapons mint from `WEAPON_CONDITION_POOL = 1600` (`src/characters/weapons.js`), and repair kits cap below full condition.
- **Found marks and crafted resale (`economy-arc-found-mark-and-mend-resale`):** Worn world drops track `foundCondition` and `selfMended` (`src/items/foundMark.js`), paying `MEND_SALE_SHARE = 1 / 3` on own mends while excluding rolled quality (`craftedRarityWorth` in `src/items/lootRarity.js`, `src/net/patronLaw.js`) so NPC shops remain the floor and player crafting remains the ceiling.
- **Elective property sinks (`economy-arc-online-home-pricing`):** Wealth sinks focus on elective prestige (online homes, guild halls, and decor), priced by building footprint and town size between `5,000` and `250,000` gold (`src/net/homeLaw.js`, `src/net/hallLaw.js`).
- **Adjacent economy systems:** Town prosperity swings of `+/- 25%` (`TOWN_PRICE_SWING = 0.25`) are covered in `town-economy-overview` and `town-economy-resale-cap-and-sea-trade`, while checkpoint gold and item verification live in `economy-ledger-and-item-judge`.
