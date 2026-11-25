---
slug: holdem-relay-seat-rules-and-reconnect-resit
title: "Hold'em Relay Seat Rules, Clocks, and Reconnect Resit"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/holdemTable.js
  - src/net/wire.js
  - src/net/cardLaw.js
  - server/src/games/holdem.js
  - src/cards/cardRemoteTable.js
  - src/scenes/worldModes.js
  - src/scenes/world.js
  - src/net/online.js
  - selfhost/upstream-ci/workflows/account-deploy.yml
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Cards-3.md"
related:
  - tavern-cards-held-hand-lift-and-chip-drags
  - holdem-relay-tables-and-gold-escrow
  - tavern-card-tables-seating-and-physics
  - tavern-cards-holdem-and-iliac-hand
invariants:
  - "Holdem frames are restamped on the client clock: world.js passes at: performance.now() into cardOnlineFrame."
  - "account-deploy.yml path filter includes src/net/holdemTable.js and src/net/cardLaw.js."
  - "cardTableLive blocks saving only for gold (non-friendly) tables."
  - "Reopening a table at different chairs or big blind is refused with 'table differs'."
  - "One seat per account per room: 'account seated' refusal."
  - "Room sits spend the `holdemSitRoomGate` budget of HOLDEM_SIT_ROOM_HZ_MAX (4/s); excess refused 'busy'."
  - "A refused sit elsewhere leaves the current seat intact; only a successful sit stands you up."
  - "Run-out streets add HOLDEM_RUNOUT_MS (1400 ms) each to nextDealAt."
traps:
  - "OnlineSession timestamps with Date.now(); cloth and panel read performance.now() - never mix clocks."
  - "exterior.js mounts worldModes without cardOnline/cardRegulars, so tables there stay offline and regulars unseen."
  - "online.js holdemWelcomes counts primary-socket welcomes; a change triggers RemoteCardTable.resit() so a dropped player reclaims the chair."
  - "Client re-sends cardStand until the relay confirms it."
dfu: []
tags:
  - cards
  - holdem
  - relay
  - seating
---

# Hold'em Relay Seat Rules, Clocks, and Reconnect Resit

Relay seating, client clock stamping, and reconnect resit coordinate across `src/net/holdemTable.js`, `src/net/cardLaw.js`, `server/src/games/holdem.js`, `src/cards/cardRemoteTable.js`, and `src/net/online.js` (with `selfhost/upstream-ci/workflows/account-deploy.yml` tracking `src/net/holdemTable.js` and `src/net/cardLaw.js`).

- **Client clock restamping and run-outs:** While `OnlineSession` stamps frames with `Date.now()`, the cloth and panel read `performance.now()`. To prevent clock mixing, `src/scenes/world.js` passes `at: performance.now()` into `cardOnlineFrame`. All-in run-out streets add `HOLDEM_RUNOUT_MS` (`1400` ms, `src/net/wire.js`) per street to `nextDealAt`.
- **Seat refusals and room rate limits:** `SIT_REFUSALS` (`src/cards/cardRemoteTable.js`) includes `table differs` (reopening at a different chair count or big blind), `account seated` (one seat per account per room), and `busy` when room sits exceed `holdemSitRoomGate` (`HOLDEM_SIT_ROOM_HZ_MAX = 4/s`). A refused sit elsewhere leaves the current seat intact; only a successful sit vacates the prior seat. `RemoteCardTable` keeps a chair pending until state confirms it and blocks watching your own table.
- **Reconnect resit, save gating, and host hooks:** In `src/net/online.js`, `holdemWelcomes` counts primary-socket welcomes and triggers `RemoteCardTable.resit()` on change while retrying `cardStand` until confirmed. In `src/scenes/worldModes.js`, `cardTableLive` blocks saving only at gold tables, and regulars draw via `drawCardRegulars` and `cardRegularBillboards` (omitted in `exterior.js`).
