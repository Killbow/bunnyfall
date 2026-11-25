---
slug: scale-service-clock-and-indexes
title: "Service Clock Statement Budget and 0091 Indexes"
domain: account-service
kind: subcard
parent: scale-clock-budget-and-heartbeat-overview
files:
  - server-account/src/cron.js
  - server-account/src/market.js
  - server-account/src/marketShared.js
  - server-account/src/heartbeat.js
  - server-account/migrations/0091_scale4.sql
routes:
  - /v1/heartbeat
tables:
  - guild_contracts
  - guild_writs
  - market_bids
  - sessions
replacesBible:
  - "01-Overview/audits/Audit-Scale.md"
related:
  - scale-clock-budget-and-heartbeat-overview
  - scale-arc-d1-write-diet-and-cron
  - economy-ledger-and-item-judge
invariants:
  - "FIRING_STATEMENTS_MAX = 600 per cron firing, split evenly across jobs, under the D1 1000-query invocation limit."
  - "jobsFor(cron) maps a cron schedule to its named jobs."
  - "0091 adds idx_guild_contracts_open_due, idx_guild_contracts_unreturned, and idx_market_bids_auction."
  - "0091 deliberately adds no index on sessions(last_seen): stale-touch writes cost more than an hourly walk."
traps:
  - "TITHE_PCT_MOST is derived from the tithe caps, not a literal; MARKET_TITHE_PCT = 0."
  - "Each heartbeat part throw becomes the server error of that part without failing the others."
dfu: []
tags:
  - cron
  - d1
  - indexes
  - market
---

# Service Clock Statement Budget and 0091 Indexes

The account service caps per-firing D1 statement usage across scheduled jobs, isolates per-part failures inside `/v1/heartbeat`, and indexes high-churn contract and auction lookups across `server-account/src/cron.js`, `server-account/src/market.js`, `server-account/src/marketShared.js`, `server-account/src/heartbeat.js`, and `server-account/migrations/0091_scale4.sql`.

- **Cron Statement Budget (`server-account/src/cron.js`, `server-account/src/market.js`, `server-account/src/marketShared.js`):** Each cron firing limits total SQL execution to `FIRING_STATEMENTS_MAX = 600` statements, split evenly across the active jobs so every firing stays well below the D1 1000-query invocation ceiling. `jobsFor(cron)` maps each cron schedule expression to its named job list, including the `arena-champion` job. In market settlement, `SETTLE_MAX = 20` bounds closed auctions processed per pass, `MARKET_TITHE_PCT = 0`, and `TITHE_PCT_MOST` is derived from the tithe cap table rather than stored as a fixed literal.
- **Targeted Indexes (`server-account/migrations/0091_scale4.sql`):** Migration `0091_scale4.sql` creates `idx_guild_contracts_open_due` and `idx_guild_contracts_unreturned` on `guild_contracts` alongside `idx_market_bids_auction` on `market_bids` (touching `guild_writs` and market settlement queries). It intentionally omits an index on `sessions(last_seen)` because frequent stale-touch index writes cost more than an hourly table walk.
- **Heartbeat Part Isolation (`server-account/src/heartbeat.js`):** On `/v1/heartbeat`, each sub-handler runs inside its own guard so a thrown exception becomes the server error of that part without aborting the remaining parts.
