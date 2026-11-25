---
slug: economy-arc-found-mark-and-mend-resale
title: "Found Mark, Own Mends, and Crafted Resale Worth"
domain: economy
kind: subcard
parent: economy-arc-overview
files:
  - src/items/foundMark.js
  - src/items/itemFields.js
  - src/trade/repairService.js
  - src/trade/tradeModes.js
  - src/net/patronLaw.js
  - src/items/lootRarity.js
  - src/professions/smithItems.js
  - src/items/ayleidStones.js
  - src/magic/enchantments.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Economy-Arc.md"
related:
  - economy-arc-overview
  - economy-arc-repair-wear-and-kits
  - town-economy-resale-cap-and-sea-trade
  - market-vendors-and-professions
invariants:
  - "A piece the world hands over worn carries integer `foundCondition`. `foundSalePercentage` reads it at `found + trunc(min(selfMended, current - found) * MEND_SALE_SHARE)` with `MEND_SALE_SHARE = 1 / 3`."
  - "Only own mends (Repair Kit, Repairs Objects, Varla Stone) call `creditOwnMend`. A smith's `repairWhole` calls `spendOwnMends` first and credits nothing."
  - "RPT1026-LEDGERLAW: `spendOwnMends` caps `selfMended` at `max(0, condition - foundCondition)` at every rise, so wear-spent credit never returns."
  - "`patronWorth` and the counter exclude `craftedRarityWorth`: a crafted piece's rolled quality is power, never price."
traps:
  - "Found books stack only with an identical mark (`sameFoundMark`), and `carryFoundMark` keeps the mark on a split."
  - "`dropFoundMark` clears both fields when an item is re-minted whole."
dfu: []
tags:
  - found-mark
  - mend-third
  - resale
  - craft-worth
  - ledger-law
---

# Found Mark, Own Mends, and Crafted Resale Worth

Worn loot tracks its discovery condition and self-repaired points so smith repairs cannot be arbitraged for resale profit, while NPC counters ignore rolled quality on crafted and imbued gear (`src/items/foundMark.js`, `src/trade/repairService.js`, `src/net/patronLaw.js`).

## Found Condition and Own Mends

- **Sale percentage formula (`src/items/foundMark.js`, `src/items/itemFields.js`, `src/trade/tradeModes.js`):** An item discovered below full durability stores an integer `foundCondition`. When sold, `foundSalePercentage` computes condition from `found + trunc(min(selfMended, current - found) * MEND_SALE_SHARE)` with `MEND_SALE_SHARE = 1 / 3`.
- **Mend credit and ledger cap (`src/trade/repairService.js`, `src/items/ayleidStones.js`, `src/magic/enchantments.js`):** Only player-driven mends (Repair Kits, Repairs Objects ticks, and Varla Stones) call `creditOwnMend`. Before any condition rise, `spendOwnMends` clamps `selfMended` to `max(0, condition - foundCondition)` so credit burned by subsequent wear never comes back. A smith's `repairWhole` runs `spendOwnMends` first and adds no `selfMended` credit.
- **Stacking and re-minting (`src/items/foundMark.js`):** Found books stack only when `sameFoundMark` matches, `carryFoundMark` copies the mark onto split stacks, and `dropFoundMark` clears both fields when an item is re-minted whole.

## Crafted and Imbued Resale Worth

- **Excluding rolled quality (`src/net/patronLaw.js`, `src/items/lootRarity.js`, `src/professions/smithItems.js`):** Both `patronWorth` and shop counters subtract `craftedRarityWorth` (including rolled tiers on imbued items), ensuring rolled quality grants combat power without inflating vendor payout.
