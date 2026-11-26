---
slug: kings-gambit-relay-table-stakes-and-ladder
title: "King's Gambit Relay Table, Gold Escrow, g1 Receipts, and Grandmaster Ladder"
domain: multiplayer
kind: subcard
parent: kings-gambit-overview
files:
  - src/net/gambit/gambitTable.js
  - src/net/gambit/gambitStakes.js
  - src/net/gambit/gambitReceipt.js
  - src/net/gambit/gambitClaims.js
  - src/cards/gambit/gambitRemoteTable.js
  - src/net/accountClient.js
  - server/src/index.js
  - server-account/src/gambit.js
  - server-account/src/cards.js
  - server-account/src/index.js
  - server-account/migrations/0115_gambit_ladder.sql
  - server-account/migrations/0092_card_stakes.sql
routes:
  - /v1/gambit/claim
  - /v1/gambit/board
  - /v1/cards/stake
tables:
  - gambit_games
  - gambit_champions
  - card_stakes
replacesBible:
  - "11-Multiplayer/Kings-Gambit.md"
related:
  - kings-gambit-overview
  - holdem-relay-tables-and-gold-escrow
  - iliac-hand-rules-relay-and-ladder
  - wire-protocol-and-frame-dispatch
  - world-events-and-signed-receipts
  - identity-tokens-and-relay-seam
invariants:
  - "Online tables run authoritatively on the relay in interior rooms via the `gambit` WebSocket frame (`validGambitIn` ops `sit`, `stand`, `ready`, `unready`, `act`, `forfeit`, `look`, and `ack`); submitted armies stay hidden until both seats are ready, and the deal fires `GAMBIT_FIRST_MS` (`3000` ms) later."
  - "Each turn allows `GAMBIT_TURN_MS` (`60000` ms); a timeout ends the turn like `end`, `GAMBIT_IDLE_TURNS` (`3`) consecutive timeouts stand the seat up with `how: 'idle'`, and standing or closing the socket forfeits immediately with `how: 'left'`."
  - "Gold-table matches choose from `GAMBIT_ONLINE_STAKES` (`[10, 50, 200, 1000, 5000]`), require both seats to match stakes escrowed in `card_stakes` under `GAMBIT_STAKE_BB` (`1`), pay the full pot to the winner, and refund both seats on a void match."
  - "Completed rated matches between two distinct accounts mint a 7-day `g1` receipt (`GAMBIT_HOW`: `king`, `forfeit`, `idle`, or `left`); submitting it to `POST /v1/gambit/claim` records one `gambit_games` row keyed by game ID using arena Elo and pair caps."
traps:
  - "A `stand` naming an earlier `gameNo` within `GAMBIT_LATE_MS` (`3000` ms) of the deal and before the seat has acted voids the match and refunds stakes without rating; a `forfeit` with a stale `gameNo` is rejected with `'stale'`."
  - "On room load, persisted tables under storage key `gambit` are validated by `gambitTableValid` and `validGambitState` and dropped if invalid, with per-table queues bounded by `GAMBIT_QUEUE_MAX` (`16`)."
  - "No draw receipt exists, and void outcomes (broken random source, drained room, failed deal, or late stand) never mint a `g1` receipt."
dfu: []
tags:
  - kings-gambit
  - relay
  - escrow
  - ladder
  - receipts
  - grandmaster
---

Online King's Gambit matches run in `Room` (`server/src/index.js` and `src/net/gambit/gambitTable.js`), escrowing gold in `card_stakes` and settling seasonal Elo on `server-account/src/gambit.js`.

## Relay Table Lifecycle and Clocks

Clients send the `gambit` frame (`validGambitIn` ops `sit`, `stand`, `ready`, `unready`, `act`, `forfeit`, `look`, and `ack`). Seat `0` is the host; `gambitSitRefusal` checks `no such chair`, `seated`, `taken`, `full`, and `bad crown` (`GAMBIT_CROWN_COUNT` `4`). Both seats submit armies with `ready` (hidden until the deal after `GAMBIT_FIRST_MS` `3000` ms). `RemoteGambitTable` and `RemoteGambitSession` (`src/cards/gambit/gambitRemoteTable.js`) drop unanswered commands after `GAMBIT_SENT_MS` (`4000` ms), buffer `GAMBIT_HELD_MAX` (`4`) presses, and pace opponent actions at `GAMBIT_REMOTE_GAP_MS` (`550` ms).

Turns expire after `GAMBIT_TURN_MS` (`60000` ms); `GAMBIT_IDLE_TURNS` (`3`) consecutive timeouts forfeit with `how: 'idle'`, while standing or disconnecting forfeits with `how: 'left'`. A `stand` naming an earlier `gameNo` within `GAMBIT_LATE_MS` (`3000` ms) of the deal before the seat acts voids the deal and refunds stakes. Room storage persists active tables under `gambit` (checked on load by `gambitTableValid` and `validGambitState`, capped at `GAMBIT_QUEUE_MAX` `16`) and uncollected receipts under `gowed:<sub>`.

## Gold Escrow, `g1` Receipts, and Grandmaster Ladder

At the gold table (`src/net/gambit/gambitStakes.js` and `server-account/src/cards.js`), both seats lock matching `GAMBIT_ONLINE_STAKES` (`[10, 50, 200, 1000, 5000]`) via `POST /v1/cards/stake`, marked in `card_stakes` with `GAMBIT_STAKE_BB` (`1`). Rated matches mint a 7-day `g1` receipt (`src/net/gambit/gambitReceipt.js` and `src/net/gambit/gambitClaims.js`, `GAMBIT_HOW`: `king`, `forfeit`, `idle`, or `left`) claimed at `POST /v1/gambit/claim` (`gambit_games`). `GET /v1/gambit/board` returns the top `GAMBIT_BOARD_TOP` (`10`) plus the caller, and the #1 account with `GAMBIT_CHAMPION_MIN_GAMES` (`10`) games across `GAMBIT_CHAMPION_MIN_FOES` (`5`) opponents holds the `grandmaster` title in `gambit_champions`.
