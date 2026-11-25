---
slug: holdem-relay-tables-and-gold-escrow
title: "Hold'em Relay Tables, Gold Stakes, and Cash-out Receipts"
domain: multiplayer
kind: subcard
parent: tavern-cards-holdem-and-iliac-hand
files:
  - src/net/holdemTable.js
  - src/net/cardLaw.js
  - src/net/cardStakes.js
  - src/net/cardReceipt.js
  - src/net/identityToken.js
  - src/net/wire.js
  - src/cards/cardRemoteTable.js
  - server/src/index.js
  - server-account/src/cards.js
routes:
  - /v1/cards/stake
  - /v1/cards/cashout
  - /internal/holdem/void
tables:
  - card_stakes
replacesBible:
  - "11-Multiplayer/Tavern-Cards.md#relay"
  - "11-Multiplayer/Tavern-Cards.md#escrow"
related:
  - tavern-cards-holdem-and-iliac-hand
  - identity-tokens-and-relay-seam
  - world-events-and-signed-receipts
  - account-routes-and-gate-wall
  - wire-protocol-and-frame-dispatch
invariants:
  - "The relay owns the deck and sends hole cards only in private per-seat frames while broadcasting `publicView` (`viewFor` at `-1`) and `STATE_KEYS` deltas over `holdem` WebSocket frames (`HOLDEM_FRAME_MAX = 1600`)."
  - "Gold tables (`t.gold`) require a signed `'stake'` order (`ORDER_TTL_S = 60 s`) matching room, table, and big blind (`HOLDEM_BBS = [2, 10, 50]`) for `20–100` bb (`HOLDEM_STAKE_MIN_BB` / `HOLDEM_STAKE_MAX_BB`), consumed once under `cstake:`."
  - "Every chip leaving a gold seat is sealed into an Ed25519 `c1` receipt (`{ s, j, r, w, i, e }`, where `w` is `'stood'`, `'broke'`, `'refused'`, `'void'`, or `'joined'`, `CARD_RECEIPT_TTL_S = 30 days`), and `/v1/cards/cashout` atomically marks `card_stakes` as `'paid'` while crediting the regional bank."
traps:
  - "Standing or disconnecting mid-hand at a gold table triggers `cashOutFolded`, folding out of turn and minting an immediate receipt for remaining stack chips while forfeiting chips already in the pot."
  - "Unseated stake orders never auto-void on the server; after `CARD_VOID_AFTER_MS` (`70 s`), the client sends a `void` op to mint a `'void'` receipt (valid within `HOLDEM_STAKE_VOID_S = 30 days`), and `/v1/cards/cashout` refunds the bank of `row.region` rather than the character's carried gold."
  - "Retrying `/v1/cards/stake` with the same `rid` returns the original signed order (`repeat: true`) without deducting gold twice."
tags:
  - multiplayer
  - relay
  - holdem
  - escrow
  - receipts
  - gold
---

Relay rooms manage up to `HOLDEM_TABLES_MAX` (`16`) tables in `src/net/holdemTable.js`, accepting `sit`, `stand`, `act`, `look`, `void`, `ack`, and `topup` operations on the `holdem` WebSocket frame. Action timers run on `HOLDEM_CLOCK_MS` (`30 s`), `HOLDEM_FIRST_MS` (`2.5 s`), `HOLDEM_GAP_MS` (`4 s` between hands), and `HOLDEM_RUNOUT_MS` (`1.4 s` per all-in street). Friendly tables grant `HOLDEM_CHIPS_BB` (`100 bb`) in free chips, whereas index `1` (`HOLDEM_GOLD_TABLE`) requires gold escrow.

## Gold Escrow and Top-Ups

To sit or top up at a gold table, the client calls `/v1/cards/stake` (`server-account/src/cards.js`), which debits gold and inserts a `'held'` row into `card_stakes` before returning a 60-second signed `'stake'` order (`src/net/identityToken.js`). The relay verifies the order via `verifyOrder` and spends its ID under `cstake:`.

Between hands, seated players can add at least `HOLDEM_TOPUP_MIN_BB` (`5 bb`) up to the `100 bb` table cap. The relay retires the top-up stake ID immediately with a `'joined'` receipt (`r = 0`) and merges the added chips into the seat's main stack receipt.

## Receipts and Cash-Out

Clients persist up to `CARD_KEPT_MAX` (`64`) stakes and unacknowledged `c1` receipts (`src/net/cardStakes.js`, `src/net/cardReceipt.js`). Redeeming a receipt at `/v1/cards/cashout` accepts any receipt age (`anyAge`), verifies that `r` does not exceed total stakes into that room, table, and big blind over the 30-day window (requiring exact equality for `'refused'` and `'void'`), and credits the character's bank in `row.region`.
