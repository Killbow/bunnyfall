---
slug: sigil-broker-request-ids-and-owed-sales
title: "Sigil Broker Request IDs, Fences, and Owed Sales"
domain: multiplayer
kind: subcard
parent: dark-regen-broker-rid-and-theme-buffer-overview
files:
  - src/worldEvents/sigilBroker.js
  - src/net/insignia.js
  - src/net/accountClient.js
  - src/scenes/world.js
  - src/world/spoilsWorld.js
  - server-account/src/brokerSales.js
  - server-account/src/accounts.js
  - server-account/src/egEconomy.js
  - server-account/src/routes/worldRoutes.js
  - server-account/migrations/0174_broker_sales.sql
routes:
  - /v1/broker/settle
  - /v1/eg/keys
tables:
  - broker_sales
  - eg_sink
  - players
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-24.md"
related:
  - dark-regen-broker-rid-and-theme-buffer-overview
  - sigil-broker-daily-stock-and-dismantle
  - elite-breach-weir-key-and-stakes
  - economy-ledger-and-item-judge
invariants:
  - "mintBrokerRid mints ids matching BROKER_RID_RE (/^b[a-z0-9]{15,31}$/). insigniaSale and panoplySale default to a fresh rid for each press."
  - "Server sales (buyInsignia, egSink) guard their UPDATE with brokerRidFreeSql and write the row with brokerSaleWrite in the same batch, only WHERE changes() > 0."
  - "settleBrokerSale runs one batch: INSERT a 'fence' row ON CONFLICT (account, rid) DO NOTHING, then UPDATE settled and set asked_by = COALESCE(asked_by, nonce). A fence answers { held: false }."
  - "The held piece goes to the first ask's nonce (by). The client mints only when by matches this page's nonce or one of its lost nonces (mine)."
  - "Owed rows { kind, id, embers, rid, account } ride the SigilBrokerOwed save vendor and are capped at OWED_MAX (8). A press is refused ('unheard') before anything is taken once the cap is reached."
traps:
  - "validOwed drops any row whose embers do not equal the catalog price (EG_SINK_EMBERS or insigniaById price), or whose rid or account is malformed or duplicated, so a tampered save cannot owe extra embers."
  - "insigniaUnheard treats offline and 5xx answers as possibly written. 4xx answers and 'no-session' are real refusals."
  - "Signed out: settleBrokerSale returns 'no-session' locally, and oweSale gives the embers back instead of owing the sale. On the server, settle returns 'guest'."
  - "settleOwedSales settles only the rows whose account matches the signed-in account, and refunds into the pack as it stands now (items())."
dfu: []
tags:
  - sigil-broker
  - broker-rid
  - idempotency
  - fence
  - owed-sales
  - currency
---

# Sigil Broker Request IDs, Fences, and Owed Sales

Sigil Broker insignia and Panoply purchases stamp each press with a request ID (`rid`) so lost responses settle idempotently against `broker_sales` (`0174_broker_sales.sql`, primary key `(account, rid)` with columns `kind`, `item`, `at`, `settled`, and `asked_by`).

## Request IDs, Atomic Writes, and Settlement Fences

- **Request IDs and sale batch (`sigilBroker.js`, `brokerSales.js`, `accounts.js`, `egEconomy.js`):** `mintBrokerRid` mints IDs matching `BROKER_RID_RE` (`/^b[a-z0-9]{15,31}$/`), used by default in `insigniaSale` and `panoplySale`. Server handlers (`buyInsignia`, `egSink`) guard their `UPDATE` with `brokerRidFreeSql` and append `brokerSaleWrite` in the same batch (`WHERE changes() > 0`).
- **Fence settlement (`brokerSales.js`, `worldRoutes.js`):** `settleBrokerSale` (`/v1/broker/settle`) runs one batch inserting a `'fence'` row (`ON CONFLICT (account, rid) DO NOTHING`) and updating `settled` with `asked_by = COALESCE(asked_by, nonce)`. A fence returns `{ held: false }`. A real sale awards the piece to the first ask's `by` nonce, and the client mints only when `by` matches the current page nonce or its lost nonces (`mine`).

## Owed Sales Queue and Refund Rules

- **Owed ledger (`sigilBroker.js`, `insignia.js`, `world.js`):** `insigniaUnheard` treats offline or `5xx` answers as possibly written (`4xx` and `'no-session'` are definite refusals). Unheard presses store `{ kind, id, embers, rid, account }` under `SigilBrokerOwed` up to `OWED_MAX` (`8`), refusing new presses with `'unheard'` at cap. `validOwed` strips rows with non-catalog `embers` (`EG_SINK_EMBERS` or `insigniaById` price) or invalid/duplicate `rid` or `account`. `brokerOwedDoor` runs `settleOwedSales` for the signed-in account and refunds embers into `items()` when a fence proves no charge occurred.
