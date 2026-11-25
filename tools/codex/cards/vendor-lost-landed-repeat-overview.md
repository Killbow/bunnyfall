---
slug: vendor-lost-landed-repeat-overview
title: "Home Trader Gold Buys: Landed Retry Flag and Idempotent Sequence Replies"
domain: economy
kind: overview
parent: null
files:
  - server-account/src/market.js
  - server-account/migrations/0032_market.sql
  - src/net/marketBook.js
  - src/saves/realmSaves.js
  - src/net/accountClient.js
routes: []
tables:
  - market_sales
  - market_deliveries
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25g.md"
related:
  - vendor-lost-client-settle-and-arrivals
  - market-vendors-and-professions
  - professions-market-auctions-and-orders
  - realm-arc-gold-law-empire-and-vendor-ceiling
invariants:
  - "A home-trader gold purchase executes as two realm acts: recording the sale in `market_sales` and collecting the `market_deliveries` row (`collected = 0` until claimed)."
  - "In `marketBuy`, `buyWithGold`, and `collectGood` (`server-account/src/market.js`), a retry carrying `landed === true` at `side.seq === realm.seq + 1` with a matching `rid` sale or collect returns the prior result with `realm.seq` rather than `409 seq`."
  - "When `landed` is omitted (`false`), strict sequence rejection remains unchanged for backward compatibility."
traps:
  - "`realmGoldAct` with `needsAnswer` treats a bare `409 seq` response as fatal and terminates the session (`ACCOUNT_ACT_WAIT_MS = 15_000` in `src/net/accountClient.js`), whereas sequence gaps of two or missing `rid` rows must still reject with `seq`."
dfu: []
tags:
  - market
  - vendors
  - idempotency
  - realm-saves
---

# Home Trader Gold Buys: Landed Retry Flag and Idempotent Sequence Replies

Home-trader gold purchases execute as two sequenced realm acts across `server-account/src/market.js`, `src/net/marketBook.js`, `src/saves/realmSaves.js`, and `src/net/accountClient.js`: recording the purchase in `market_sales` and claiming the `market_deliveries` row (`collected = 0` until claimed, schema in `server-account/migrations/0032_market.sql`).

## Landed Retry Replies

- **Idempotent sequence matching (`server-account/src/market.js`):** In `marketBuy`, `buyWithGold`, and `collectGood`, a retry carrying `landed === true` at `side.seq === realm.seq + 1` whose `rid` matches the prior sale or delivery collect returns the committed result along with `realm.seq` instead of rejecting with `409 seq`. Concurrent duplicate batches in `buyWithGold` return the winning first sale when the second batch hits `seq`.
- **Backward compatibility and strict rejection (`src/saves/realmSaves.js`, `src/net/accountClient.js`):** Because `realmGoldAct` with `needsAnswer` treats a bare `409 seq` reply after `ACCOUNT_ACT_WAIT_MS = 15_000` as fatal and ends the session, returning `realm.seq` preserves the active session on retry. Requests that omit `landed` (`false`), jump by a sequence gap of two or more, or lack a matching `rid` row still reject with `seq`.
