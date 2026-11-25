---
slug: holdem-relay-stake-void-and-table-sync
title: "Hold'em Relay Stake Voiding and Table Sync"
domain: cards
kind: subcard
parent: holdem-stake-escrow-and-receipts-overview
files:
  - server/src/games/holdem.js
  - server/src/room/keys.js
  - server/src/room/store.js
  - src/net/holdemTable.js
  - src/cards/cardRemoteTable.js
  - src/net/wire.js
  - src/net/online.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Cards-4.md"
related:
  - holdem-stake-escrow-and-receipts-overview
  - holdem-relay-tables-and-gold-escrow
  - tavern-card-tables-seating-and-physics
invariants:
  - "HOLDEM_STAKE_VOID_S = CARD_RECEIPT_TTL_S: unseated stakes void on receipt lifetime."
  - "Relay without a gate signing key refuses with 'stakes closed'."
  - "An order from another room is left unspent ('stake elsewhere'); its home room voids it."
  - "Cash-out items stay queued until signed and persisted; tables never delete with unsigned receipts."
traps:
  - "Re-read table state after the stake await; racing sits can hit deleted tables."
  - "Deltas apply only to consecutive frames, else full resync."
  - "validHoldemOut must reject bad hand shapes (handShapeOk)."
dfu: []
tags:
  - holdem
  - relay
  - sync
  - caps
---

# Hold'em Relay Stake Voiding and Table Sync

Relay stake consumption, unseated voiding, and frame synchronization run across `server/src/games/holdem.js`, `server/src/room/keys.js`, `server/src/room/store.js`, `src/net/holdemTable.js`, `src/cards/cardRemoteTable.js`, `src/net/wire.js`, and `src/net/online.js`.

- **Relay storage keys, void lifetime, and room boundaries:** Relay storage tracks consumed stake IDs under `stakeKeyOf(j) = 'cstake:' + j` and pending payouts under the `'cashout:'` prefix, bounded by `HOLDEM_OWED_MAX = 64` with paged `cstake` sweeps. Unseated stakes share the receipt lifetime (`HOLDEM_STAKE_VOID_S = CARD_RECEIPT_TTL_S`). A relay lacking a gate signing key refuses gold sits with `'stakes closed'`, and an order minted for another room is left unspent with `'stake elsewhere'` so its home room can void it.
- **Await re-reads and unsigned payout retention:** Because racing sits can hit a table deleted during an async stake verification, the relay must re-read table state after the stake await. Cash-out items remain queued until both signed and persisted to room storage, and tables never delete while unsigned receipts remain.
- **Frame validation and client table sync:** On the wire (`src/net/wire.js`, `src/net/online.js`), `validHoldemOut` enforces `handShapeOk` to reject malformed hand shapes. In `src/cards/cardRemoteTable.js`, state deltas apply only to consecutive frames (falling back to a full resync on any gap), and stake or table-kind refusals immediately clear the pending chair.
