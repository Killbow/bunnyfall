---
slug: realm-arc-gold-law-empire-and-vendor-ceiling
title: "Online Gold Law: Empire Lender, Vendor Ceiling, Pile and Quest Gold"
domain: economy
kind: subcard
parent: realm-arc-overview
files:
  - src/trade/banking.js
  - src/trade/shopStock.js
  - src/items/loot.js
  - src/systems/quest/actions.js
  - src/world/worldTick.js
  - src/net/realmGoldLaw.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Realm-Arc.md"
related:
  - realm-arc-overview
  - market-vendors-and-professions
  - economy-ledger-and-item-judge
invariants:
  - "Online, the Empire is one lender: `empireRefusal` refuses a second loan anywhere or any loan after a default, and `borrowDecision` and `borrowLoan` apply it."
  - "After a default, `drawEmpireAccounts` takes from every branch and `garnishDeposit` takes new deposits toward defaulted loans; `empireJoin` calls in excess debt on join."
  - "`calculateTradePrice` online clamps Mercantile and Personality to 0..`ONLINE_HAGGLE_MAX` (100) and caps a sale at `ONLINE_SALE_SHARE` (0.5) of the lowest counter ask, scaled beneath it by `ONLINE_SALE_SKILL_WEIGHT` (0.5)."
  - "`unlevelPileGold` divides online pile gold by level, never below 1; `shareQuestGold` splits shared quest gold by party size, never below 1."
  - "A quest gold item sets `goldPaid` when `GetItem` or `GivePc` pays it, so neither pays the same gold twice."
traps:
  - "The sale ceiling is half the lowest possible ask, not the ask for the seller; using the seller ask made sales fall as skills rose (`MERC-RISE`)."
  - "`calculateTradePrice` divides rather than shifting right by 8 on the final product to avoid 32-bit integer wrap on huge lots (`TRADE-WRAP`)."
dfu:
  - FormulaHelper.cs
tags:
  - economy
  - banking
  - vendors
  - loot
  - gold-sinks
---

# Online Gold Law: Empire Lender, Vendor Ceiling, Pile and Quest Gold

Online gold rules in `src/net/realmGoldLaw.js` unify regional banks into one Empire lender, cap vendor resale margins against classic `FormulaHelper.cs` (`CalculateCost`), and scale loot piles, quest rewards, and essentials for multiplayer play.

## Empire-Wide Banking and Spend Order

- **Single Empire lender (`src/trade/banking.js`, `src/world/worldTick.js`):** Online, `empireRefusal` blocks a second loan in another region or borrowing after any default via `borrowDecision` and `borrowLoan`. On default, `drawEmpireAccounts` sweeps balances across every branch, `garnishDeposit` diverts new deposits toward unpaid debt, and `empireJoin` calls in excess debt on join.
- **Gold draw order (`src/net/realmGoldLaw.js`):** `payFromSave` and `creditSave` sequence gold deductions and credits across purse gold, letters of credit, and regional bank accounts.

## Vendor Ceilings, Essentials, and Gold Faucets

- **Counter haggle ceiling (`src/trade/shopStock.js`):** Extending DFU `CalculateCost` (`FormulaHelper.cs`), `calculateTradePrice` clamps online Mercantile and Personality to `0..ONLINE_HAGGLE_MAX` (`100`) and divides rather than shifting right by `8` to prevent 32-bit integer overflow (`TRADE-WRAP`). Online sales cap at `ONLINE_SALE_SHARE` (`0.5`) of the lowest possible counter ask (avoiding `MERC-RISE`) and scale beneath that ceiling by `ONLINE_SALE_SKILL_WEIGHT` (`0.5`).
- **Essentials, loot piles, and quests (`src/items/loot.js`, `src/systems/quest/actions.js`):** `ONLINE_ESSENTIALS_PRICE_SCALE` (`0.5`) halves rooms, food, cures, fares, and potions (rounded up). `addPileLootExtras` calls `unlevelPileGold` to divide online gold piles by level (minimum `1`), and `shareQuestGold` splits shared quest payouts by party size (minimum `1`).
