---
slug: town-economy-prosperity-and-pricing
title: "Prosperity Bands and Counter Price Factors"
domain: economy
kind: subcard
parent: town-economy-overview
files:
  - src/net/townEconLaw.js
  - src/trade/townEcon.js
  - src/net/townSeatLaw.js
  - src/trade/shopStock.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Town-Economy-Arc.md"
related:
  - town-economy-overview
  - town-economy-resale-cap-and-sea-trade
  - seats-arc-overview
  - market-vendors-and-professions
invariants:
  - "Bands (`TOWN_BANDS`, by minimum value): Booming 85, Thriving 65, Steady 35, Struggling 15, and Destitute 0."
  - "Asking factor `townBuyFactor` = 1 - 0.25 * (p - 50) / 50, yielding 1.25 at 0 and 0.75 at 100 (`TOWN_PRICE_SWING` = 0.25)."
  - "Paying factor `townSaleFactor` = 1 - 0.25 * abs(p - 50) / 50, bounded between 0.75 and 1.0 and never rising above 1."
  - "`townShopFactor` sets `ask = max(TOWN_FACTOR_FLOOR 0.70, townBuyFactor * seatFactor)`. Sell and SellMagic return `min(townSaleFactor, ask)`, Buy and Repair return `ask`, and every other mode returns 1."
traps:
  - "A seat or Market Day discount must lower what a counter pays along with what it asks (`SEAT-LOOP`). Otherwise essentials, which cost half price online, can be bought and sold back at a profit."
  - "Shop stock and shelves never scale with prosperity; `src/trade/shopStock.js` has no reference to the town economy."
dfu:
  - FormulaHelper.cs
tags:
  - prosperity
  - price-factor
  - seat-discount
  - bands
---

# Prosperity Bands and Counter Price Factors

`src/net/townEconLaw.js` and `src/trade/townEcon.js` map each settlement's `0-100` Prosperity score into named bands and counter price multipliers that layer with DFU `CalculateCost` and `ApplyRegionalPriceAdjustment` (`FormulaHelper.cs`) without altering shop shelves in `src/trade/shopStock.js`.

## Market Cycle, Seat Terms, and Bands

- **Bands (`TOWN_BANDS`):** Settlements classify by minimum prosperity into `Booming` (`85`), `Thriving` (`65`), `Steady` (`35`), `Struggling` (`15`), and `Destitute` (`0`).
- **Two-wave cycle (`TOWN_CYCLE`):** Each town blends two UTC-day sine waves (amplitude `12` over `11` days and amplitude `6` over `29` days), phased by the FNV-1a hash of `townKeyOf(px, py) = py * 1000 + px`.
- **Seat contribution (`townSeatTerm`, `src/net/townSeatLaw.js`):** Seat standing adds `(standing - 50) / 5` plus the edict delta (`market-day: 6`, `festival: 8`, `open-gates: 3`, `levy: -6`, and `curfew: -4`).

## Counter Ask and Pay Multipliers

- **Ask and pay curves (`TOWN_PRICE_SWING = 0.25`):** `townBuyFactor(p)` computes `1 - 0.25 * (p - 50) / 50` (`1.25` at `0`, `0.75` at `100`). `townSaleFactor(p)` computes `1 - 0.25 * abs(p - 50) / 50`, peaking at `1.0` at `p = 50` and falling to `0.75` at both extremes.
- **Combined shop factor (`townShopFactor`):** With `ask = max(TOWN_FACTOR_FLOOR 0.70, townBuyFactor * seatFactor)`, `Buy` and `Repair` return `ask`, while `Sell` and `SellMagic` return `min(townSaleFactor, ask)` so seat discounts lower payouts in lockstep (`SEAT-LOOP`). Offline places apply `seatFactor` alone (sales `<= 1`).
