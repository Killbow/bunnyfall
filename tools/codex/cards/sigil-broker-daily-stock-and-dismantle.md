---
slug: sigil-broker-daily-stock-and-dismantle
title: "Sigil Broker Daily Stock, Bound Wares, and Dismantle Refunds"
domain: multiplayer
kind: subcard
parent: sigil-sets-overview
files:
  - src/worldEvents/sigilBroker.js
  - src/worldEvents/gateSpoils.js
  - src/items/itemBound.js
  - src/ui/brokerWindow.js
  - server-account/src/egEconomy.js
  - server-account/src/brokerSales.js
  - server-account/src/routes/worldRoutes.js
  - server-account/src/routes/playRoutes.js
  - server-account/migrations/0124_elite_breach.sql
routes:
  - /v1/broker/settle
  - /v1/eg/sink
tables:
  - eg_sink
replacesBible:
  - "11-Multiplayer/Sigil-Sets.md#7"
related:
  - sigil-sets-overview
  - breach-rite-broker-and-multi-court
  - economy-ledger-and-item-judge
  - realm-saves-and-mod-save-hooks
invariants:
  - "`brokerStock(day)` is seeded from the UTC day alone (`brokerDay`, `BROKER_DAY_MS`) and yields six offers: one armor piece per world set (slots 0-3), one world-set weapon (slot 4), one Ruhn's Regalia piece (slot 5)."
  - "`BROKER_PRICES` are rare 4, legendary 6, weapon 6, regalia 12 (doubled by SS2); a Legendary appears one time in `BROKER_LEGENDARY_IN` (4)."
  - "Each offer is buyable once per character per day; the record rides the `SigilBroker` modSaveData vendor."
  - "Every ware is `bound` and stamped with `stonesPaid`; `dismantleStones` returns floor(paid * `BROKER_DISMANTLE_SHARE` 0.5), minimum 1."
traps:
  - "`brokerSale` re-mints the offer from `brokerStock(offer.day)` and rejects a forged id or price ('gone')."
  - "`makeBrokerSale` refuses 'heavy' when `canCarry` fails, checked against the pack after the stones leave it."
  - "Locked stones are never spent; dismantle refuses worn ('worn') or locked ('locked') wares, and the day's mark stays after dismantling."
  - "Bound items may only go to `BOUND_KEEPS` (wagon, storage); Sigil Stones are bound by their template."
  - "The weekly Panoply sale (`panoplySale`, `EG_SINK_EMBERS` 20, one per account per arena week in `eg_sink`) carries no `stonesPaid` and never dismantles."
dfu: []
tags:
  - sigil-broker
  - currency
  - bound
  - dismantle
  - daily-stock
---

# Sigil Broker Daily Stock, Bound Wares, and Dismantle Refunds

The Sigil Broker exchanges Deadlands Embers (`stonesText` in `src/worldEvents/sigilBroker.js`) for deterministic daily set pieces, bound wares, and dismantle refunds.

## Daily Stock and Purchase Validation

- **Six daily offers (`sigilBroker.js`):** `brokerStock(day)` seeds from the UTC day (`brokerDay`, `BROKER_DAY_MS`) using base templates and materials (Dwarven to Daedric) so every client mints identical items: one armor piece per world set (slots `0-3`), one world-set weapon (slot `4`), and one Ruhn's Regalia piece (slot `5`). Armor rolls Legendary one time in `BROKER_LEGENDARY_IN` (`4`). `BROKER_PRICES` are `4` (Rare), `6` (Legendary), `6` (weapon), and `12` (Regalia).
- **Purchases (`sigilBroker.js`, `brokerSales.js`, `worldRoutes.js`):** Each slot is buyable once per character per day under `SigilBroker`. `brokerSale` re-mints from `brokerStock(offer.day)` and rejects forged ids or prices (`'gone'`). `makeBrokerSale` spends unlocked stones first, then checks `canCarry` before refusing `'heavy'`. Unanswered `/v1/broker/settle` sales persist in `SigilBrokerOwed` (up to `OWED_MAX = 8`) for retry.

## Bound Storage, Dismantling, and Panoply Sink

- **Bound rules (`itemBound.js`, `sigilBroker.js`):** Broker wares and stones are bound to `BOUND_KEEPS` (wagon, storage). Daily wares stamp `stonesPaid`; `dismantleStones` refunds `Math.max(1, Math.floor(paid * BROKER_DISMANTLE_SHARE))` (`0.5`), refuses `'worn'` or `'locked'` items, and keeps the daily mark spent.
- **Weekly Panoply (`egEconomy.js`, `playRoutes.js`, `0124_elite_breach.sql`):** `panoplySale` (`POST /v1/eg/sink`) sells one Panoply piece per account per week in `eg_sink` for `EG_SINK_EMBERS = 20` without `stonesPaid` (non-dismantlable).
