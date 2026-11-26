---
slug: integrity-item-law-holds-and-wealth-budget
title: "Item Law Holds, Ledger Ids, and the Wealth Budget"
domain: economy
kind: subcard
parent: integrity-arc-overview
files:
  - server-account/src/verdict.js
  - server-account/src/judge.js
  - server-account/src/ledger.js
  - server-account/src/budget.js
  - server-account/src/staffRealm.js
  - server-account/src/market.js
  - server-account/src/service.js
  - src/items/itemLaw.js
routes:
  - /v1/mod/realm-holds
  - /v1/mod/realm-findings
  - /v1/mod/realm-clear
  - /v1/mod/realm-hold
  - /v1/mod/realm-rollback
  - /v1/mod/realm-budget
  - /v1/mod/realm-gains
  - /v1/mod/realm-trades
  - /v1/staff/fix/bank
  - /v1/staff/fix/letter
  - /v1/staff/item/catalogue
  - /v1/staff/item/give
tables:
  - realm_characters
  - item_dupes
  - products
  - realm_wealth_hours
  - realm_trades
  - realm_repairs
  - piece_escrow
  - realm_config
replacesBible:
  - "06-Systems/Integrity-Arc.md"
related:
  - integrity-arc-overview
  - economy-ledger-and-item-judge
  - market-vendors-and-professions
invariants:
  - "Each hold records a strike; reaching `STRIKES_FOR_TIMED` (`3`) escalates to a timed hold of `LAW_HOLD_S` (`7` days) first and `LAW_HOLD_REPEAT_S` (`30` days) on repeat."
  - "Strikes and completed timed holds expire after `LAW_FADE_S` (`30` days) without new findings."
  - "Item unique ids match `ITEM_UID_RE` (16 lowercase hex digits), and the ledger assigns each key to the first record that holds it."
  - "A contested claim waits `DUPE_GRACE_S` (`750` s) before locking only the claimant copy without adding a strike."
  - "Crafted pieces listed on the market move from the seller record into `piece_escrow` in the same batch."
traps:
  - "`DUPE_GRACE_S` is `750` seconds (two and a half checkpoints), not `300`."
  - "`WEALTH_VERSION` (`2`) must increment whenever `wealthOf`, `itemWorth`, or deed prices change how a save is valued, or every character records a false gain."
tags:
  - integrity
  - item-law
  - holds
  - ledger
  - wealth-budget
---

Complementing `economy-ledger-and-item-judge`, this card covers strike escalation, checkpoint key limits, wealth-budget bands, and staff repair routes across `server-account/src/verdict.js`, `server-account/src/judge.js`, `server-account/src/ledger.js`, and `server-account/src/budget.js`.

## Strikes, Findings, and Escrow

`itemFindings` (`src/items/itemLaw.js`) and `server-account/src/judge.js` retain up to `FINDINGS_KEPT = 40` findings per evaluation. `server-account/src/verdict.js` allows `OUTLIER_ALLOWANCES = 10` and `LEVEL_RISE_S = 300` before placing a hold. Each hold counts as a strike: at `STRIKES_FOR_TIMED = 3`, holds switch to timed durations of `LAW_HOLD_S` (7 days) and then `LAW_HOLD_REPEAT_S` (30 days), fading after `LAW_FADE_S` (30 days) of clean checkpoints.

Each checkpoint processes at most `LEDGER_NEW_MAX = 960` new item keys and `LEDGER_KEYS_MAX = 6000` total keys (`ITEM_UID_RE`). Contested keys in `item_dupes` wait `DUPE_GRACE_S = 750` seconds before locking the claimant copy without a strike. When a player lists a crafted item (`products`) in `server-account/src/market.js`, the piece moves into `piece_escrow` in the same batch.

## Wealth Budget and Staff Routes

`server-account/src/budget.js` tracks hourly net worth changes in `realm_wealth_hours` under `WEALTH_VERSION = 2`. `BUDGET_DEFAULT` (`enforce: false`, configurable in `realm_config`) defines five level bands (`upTo` 5, 10, 20, 30, and 1000) earning 30,000 to 300,000 gold per play hour with caps from 180,000 to 1,800,000. Signed boss receipts credit `SPOILS_GRANT_BASE = 60000` plus `SPOILS_GRANT_PER_LEVEL = 2000` per level.

Moderation and repair routes in `server-account/src/staffRealm.js` and `server-account/src/service.js` inspect holds, findings, budgets, gains, and `realm_trades`, or issue audited repairs (`realm_repairs`) via `/v1/staff/fix/bank`, `/v1/staff/fix/letter`, `/v1/staff/item/catalogue`, and `/v1/staff/item/give`.
