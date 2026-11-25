---
slug: town-economy-overview
title: "Town Economy Arc Overview"
domain: economy
kind: overview
parent: null
files:
  - src/net/townEconLaw.js
  - src/trade/townEcon.js
  - src/trade/townEconHost.js
  - src/net/townEconBook.js
  - server-account/src/townEcon.js
  - server-account/src/routes/townRoutes.js
  - server-account/migrations/0132_town_econ.sql
routes:
  - /v1/towns/econ
  - /v1/towns/witness
  - /v1/towns/watch
  - /v1/towns/strike
  - /v1/towns/audit
tables:
  - town_econ_towns
  - town_econ_acts
  - town_econ_days
  - town_econ_seen
  - town_econ_kept
  - town_econ_struck
replacesBible:
  - "06-Systems/Town-Economy-Arc.md"
related:
  - town-economy-prosperity-and-pricing
  - town-economy-players-share-and-registry
  - town-economy-resale-cap-and-sea-trade
  - town-economy-cards-and-market-days
  - seats-arc-overview
  - economy-ledger-and-item-judge
invariants:
  - "Each online town has one Prosperity value from 0 to 100 (`townProsperity`). The law module is pure: no clock, no network, and no DOM."
  - "Only MAPS location types 0-2 (`TownCity`, `TownHamlet`, and `TownVillage`) have an economy (`TOWN_ECON_TYPES`, `isEconTown`)."
  - "The economy runs online only. Offline, counters price as DFU does by region and no town card is shown."
traps:
  - "Never route town pricing through `regionPriceAdjustment`, because quest gold reads that index."
  - "`TOWNS_OPEN` set to `'off'` closes the `/v1/towns/*` doors and the minute share keeping, but the hourly sweep keeps running."
dfu:
  - SaveVars.cs
  - FormulaHelper.cs
tags:
  - town-economy
  - prosperity
  - online-only
  - economy
---

# Town Economy Arc Overview

The Town Economy system gives each online settlement of MAPS location types `0-2` (`TownCity`, `TownHamlet`, and `TownVillage`, tested by `TOWN_ECON_TYPES` and `isEconTown`) a `0-100` Prosperity score (`townProsperity`) that drives counter prices, naval exchange factors, Market Days, and map tooltip cards. Offline sessions bypass the system completely, keeping classic DFU regional pricing (`PriceAdjustment` in `SaveVars.cs` and `ApplyRegionalPriceAdjustment` in `FormulaHelper.cs`) and hiding town cards.

## Architecture and Prosperity Formula

- **Modules and tables:** `src/net/townEconLaw.js` contains pure math with no clock, network, or DOM access. `src/trade/townEcon.js` (`createTownEcon`) and `src/trade/townEconHost.js` wire client counters, while `src/net/townEconBook.js`, `server-account/src/townEcon.js`, and `server-account/src/routes/townRoutes.js` serve `/v1/towns/*` over the six `town_econ_*` tables created in `server-account/migrations/0132_town_econ.sql`.
- **Prosperity sum (`src/net/townEconLaw.js`):** `townProsperity` sums `TOWN_BASE` (`50`), `TOWN_SIZE` by location type (`0: 6`, `1: 2`, `2: -2`), the two-wave market cycle, the seat term, the active raid term (`-15`), the players' share (`0..30`), and the sea-lane term (`0..6`), rounded and clamped to `0..100`.
- **Isolation and switches:** Town pricing never mutates `regionPriceAdjustment`, preserving regional quest reward math. Setting `TOWNS_OPEN` to `'off'` closes `/v1/towns/*` and the minute share job while the hourly cleanup sweep continues.

## Subcards

- `town-economy-prosperity-and-pricing`
- `town-economy-players-share-and-registry`
- `town-economy-resale-cap-and-sea-trade`
- `town-economy-cards-and-market-days`
