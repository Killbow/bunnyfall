---
slug: staff-events-rewards-and-claims
title: "Staff Event Rewards, Board, e1 Receipts, and Silver Claims"
domain: multiplayer
kind: subcard
parent: staff-events-overview
files:
  - src/net/staffEvent/staffEventLaw.js
  - src/net/staffEvent/staffEventReceipt.js
  - server/src/staffEvents.js
  - src/worldEvents/staffEventSpoils.js
  - server-account/src/staffEventPay.js
  - server-account/src/routes/playRoutes.js
  - server-account/migrations/0208_event_pay.sql
routes:
  - "/v1/event/claim"
tables:
  - event_pay
  - staff_events
replacesBible:
  - "11-Multiplayer/Staff-Events.md"
related:
  - staff-events-overview
  - staff-events-order-book-and-meter
  - world-events-and-signed-receipts
  - dagons-breach-world-boss
invariants:
  - "REWARD-KILLS (staffEventEarned): an earner needs at least max(STAFF_EVENT_EARN_KILLS 3, rk) kills (h). Standing alone earns nothing, and guest 'id:' sockets never earn."
  - "Ranking is by kills, then killing blow, then stand ticks (STAFF_EVENT_STAND_TICK_MS 4000), then account id. The board (staffEventBoard) is the top STAFF_EVENT_BOARD_MAX (10)."
  - "The cell pays once, at the first boss fall (payReward), and stores the receipts with the ledger before saying anything."
  - "/v1/event/claim pays silver once per (event, account) via INSERT OR IGNORE into event_pay. The amount comes from the stored staff_events.ev, never from the client."
  - "Staff event spoils go through `shared.raidSpoils.grant` under `spoilsLock`, keyed `sev:<id>` per account, so a receipt the relay re-sends after a reconnect grants nothing."
traps:
  - "Staff receipts use prefix 'e1' (STAFF_RECEIPT_V), the same string as EG_RECEIPT_V in egReceipt.js. Both are signed with GATE_SIGNING_KEY, so only the claim shapes keep them apart."
  - "Without GATE_SIGNING_KEY the receipt is sent unsigned ('e1.<body>.'). The game still rolls spoils, but the claim is refused."
  - "If an earner disconnects at the instant the boss falls and the event ends there, the cell ledger is dropped and the receipt cannot be re-sent."
dfu: []
tags:
  - staff-events
  - rewards
  - receipts
  - leaderboard
  - spoils
---

# Staff Event Rewards, Board, e1 Receipts, and Silver Claims

When a staff event's first mini boss falls, the cell settles the leaderboard and mints reward receipts once (`payReward` in `server/src/staffEvents.js`), persisting them in the cell ledger before broadcasting.

- **Eligibility and board (`src/net/staffEvent/staffEventLaw.js`):** Under `staffEventEarned`, authenticated accounts (never guest `id:` sockets) must score at least `max(STAFF_EVENT_EARN_KILLS 3, rk)` kills (`h`); standing ticks alone earn nothing. `staffEventBoard` ranks earners by kill count, killing blow, stand ticks (`STAFF_EVENT_STAND_TICK_MS` `4000` ms), and account id, broadcasting the top `STAFF_EVENT_BOARD_MAX` (`10`) in `{t: 'sev', k: 'bd', id, top}`.
- **Signed `e1` receipts and client spoils (`src/net/staffEvent/staffEventReceipt.js`, `src/worldEvents/staffEventSpoils.js`):** Each earner receives an `e1` (`STAFF_RECEIPT_V`) receipt signed with `GATE_SIGNING_KEY` (TTL `STAFF_RECEIPT_TTL_S` `7` days, wire cap `STAFF_RECEIPT_WIRE_MAX` `512` chars) via `{t: 'sev', k: 'rc'}` on their newest socket and again on reconnect words while the ledger lives. On the client, `rollStaffSpoils` (`STAFF_SPOILS_TABLE`) uses the receipt seed to grant `100 * level * 0.8..1.2` gold plus event `gd`, one Magic-or-better item for every earner, one Rare-or-better item for the top `10`, and an extra piece with a `10%` Legendary (else Rare) roll for rank `1`, excluding Dagon gear.
- **Account silver claims (`server-account/src/staffEventPay.js`, `server-account/src/routes/playRoutes.js`):** `POST /v1/event/claim` verifies the `e1` receipt and executes `INSERT OR IGNORE` into `event_pay` (`0208_event_pay.sql`), crediting the silver amount stored in `staff_events.ev` once per `(event, account)`.
