---
slug: town-economy-resale-cap-and-sea-trade
title: "Counter Resale Cap and Port Sea Trade"
domain: economy
kind: subcard
parent: town-economy-overview
files:
  - src/trade/tradeModes.js
  - src/net/patronLaw.js
  - src/items/itemFields.js
  - src/items/reforge.js
  - src/professions/materialsBag.js
  - src/systems/naval/harbourOffice.js
  - src/systems/naval/tradeGoods.js
  - src/systems/naval/seaLanes.js
  - src/trade/townEconHost.js
routes:
  - /v1/towns/watch
tables:
  - town_econ_acts
replacesBible:
  - "06-Systems/Town-Economy-Arc.md"
related:
  - town-economy-overview
  - town-economy-prosperity-and-pricing
  - captains-sea-overview
  - economy-ledger-and-item-judge
invariants:
  - "Online, `markCounterBought` stamps each counter purchase with `counterPaid` (`COUNTER_PAID_MARK`) and `counterValue` (`COUNTER_VALUE_MARK`). `tradeCost` then caps the resale payout at what was paid (`LAW-3`)."
  - "A gem bought at a counter and socketed records `[index, paid]` in `socketBought`, and reforge extraction keeps that record. Only the counter-sold share of the item value is capped (`PRICE-2`, `PRICE-6`)."
  - "Counter-marked pieces never enter Stores, writs, or the market (`counterPiece` in `src/professions/materialsBag.js`)."
traps:
  - "Port exchanges use `townExchangeFactors` (`ask` = buy factor, `pay` = sale factor) with no seat discount. Exchange goods carry the counter mark and no shop buys them."
  - "Ports flagged `ether` (beyond the Veil) map to no town in `portTown`, so they receive no economy factors."
dfu: []
tags:
  - resale-cap
  - arbitrage
  - sea-trade
  - naval
  - exchange
---

# Counter Resale Cap and Port Sea Trade

To stop cross-town arbitrage between discounted and booming markets, online counter purchases carry persistent price marks (`src/net/patronLaw.js`, `src/trade/tradeModes.js`), while coastal ports connect naval trade and active sea lanes to town prosperity (`src/trade/townEconHost.js`).

## Counter Purchase Marks and Resale Cap

- **Direct resale cap (`src/net/patronLaw.js`, `src/items/itemFields.js`, `src/trade/tradeModes.js`):** Online, `markCounterBought` stamps each counter purchase with `counterPaid` (`COUNTER_PAID_MARK`) and `counterValue` (`COUNTER_VALUE_MARK`). On resale, `tradeCost` caps payout for the counter-bought portion at `counterPaid` (`LAW-3`).
- **Socketed gems and bags (`src/items/reforge.js`, `src/professions/materialsBag.js`):** Socketing a counter-bought gem records `[index, paid]` in `socketBought`, and reforge extraction preserves that stamp so only the counter-bought share of an item is capped (`PRICE-2`, `PRICE-6`). `counterPiece` blocks counter-marked materials from Stores, writs, or market listings because withdrawals mint unmarked pieces.

## Port Exchanges, Sea Lanes, and Watch Vouching

- **Harbor exchange pricing (`src/systems/naval/harbourOffice.js`, `src/systems/naval/tradeGoods.js`):** Port exchanges use `townExchangeFactors` (`ask = townBuyFactor`, `pay = townSaleFactor`) without seat discounts, stamping cargo with counter marks while standard shops refuse exchange goods. In `portTown` (`src/trade/townEconHost.js`), `ether` ports map to no town.
- **Sea-lane bonus and dealings (`src/systems/naval/seaLanes.js`):** `townSeaTerm(lanes)` adds `min(TOWN_SEA_LANES_MAX 3, lanes) * TOWN_SEA_LANE` (`2`, up to `+6` prosperity) from `laneNetwork` once loaded. Port dealings on `/v1/towns/watch` (`town_econ_acts`) require a Watch tick within `TOWN_SEA_REACH_PX` (`1`) of the port no older than `TOWN_SEA_TICK_S` (`600` s), counting as `'sea'` (weight `2`).
