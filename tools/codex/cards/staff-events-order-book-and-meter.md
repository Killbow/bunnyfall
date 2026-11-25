---
slug: staff-events-order-book-and-meter
title: "Staff Event Orders, Hub Book, and Cell Kill Meter"
domain: multiplayer
kind: subcard
parent: staff-events-overview
files:
  - src/net/staffEvent/staffEventLaw.js
  - server-account/src/staffEvents.js
  - server-account/src/sanctions.js
  - src/net/identityToken.js
  - server/src/staffEvents.js
  - server/src/room/doors.js
  - server/src/cellMoves.js
  - src/net/wire.js
routes:
  - "/v1/staff/event"
  - "/v1/staff/events"
  - "/internal/sev/book"
  - "/internal/sev/tell"
  - "/internal/sev/call"
tables:
  - staff_events
replacesBible:
  - "11-Multiplayer/Staff-Events.md"
related:
  - staff-events-overview
  - staff-events-packs-and-mini-boss
  - room-engine-and-hub-sharding
  - identity-tokens-and-relay-seam
invariants:
  - "validStaffEvent/staffEventFault is the single shape every door and frame carries. The fault names the first refused field so the panel can show it."
  - "The cell credits words only from sockets whose pose stands on the event pixel. Credit is capped by staffEventCap: STAFF_EVENT_KILLS_BURST (10) plus one per STAFF_EVENT_KILL_MS (250 ms), and never beyond the event total."
  - "A boss kill word (bk) never adds to the meter."
  - "BOSS-AGAIN (staffBossCall): the meter calls another boss every e.m kills once the last boss has fallen. Each staff 'boss' op (fb, 0..99) adds one more boss."
  - "EVENT-CLEAR removes only rows in state 'ended' or 'failed', never a live or starting row."
traps:
  - "Kill counts are the client's own word. A forged word can call the boss early but can never stage, move, or end an event; only a signed order can."
  - "A lapsed event (ue passed) ends only on the next hub interaction (an order, a hello, or a cell book/tell), via lapse()."
  - "'sevents' and 'sevl:' are Durable Object storage keys, not D1 tables."
dfu: []
tags:
  - staff-events
  - relay
  - hub
  - cell-ledger
  - orders
---

# Staff Event Orders, Hub Book, and Cell Kill Meter

Every staff event order and wire frame is validated by `validStaffEvent` and `staffEventFault` (`src/net/staffEvent/staffEventLaw.js`), naming the first rejected field for the Staff Panel.

- **Account orders and hub book (`server-account/src/staffEvents.js`, `server/src/staffEvents.js`):** `/v1/staff/event` handles `start`, `end`, `boss`, `look`, and `clear` (by id or all ended/failed rows), signing `sevent` tokens (`mintStaffEventOrder` in `src/net/identityToken.js`) and pushing them via `pushLaw` (`server-account/src/sanctions.js`). Rows in `staff_events` move from `starting` to `live` or `failed` and then `ended`, while `/v1/staff/events` reads the book. The relay hub persists the active book under Durable Object key `STAFF_EVENTS_KEY` (`sevents`), retains `SEV_BOARDS_KEPT` (`2 * STAFF_EVENTS_MAX`) fallen-boss boards, and broadcasts `STAFF_EVENT_OUT_KINDS` (`ev`, `end`, `st`, `bd`, `rc`, `an`) over `sev` frames (`src/net/wire.js`).
- **Cell kill meter and internal doors (`server/src/room/doors.js`, `server/src/cellMoves.js`):** Players on the event pixel send `{t: 'sev', k: 'w', id, px, py, n, s, bu, bk, fb, h, mu}` words folded by `foldStaffWord` into the cell ledger (`sevl:<id>`) under `staffEventCap` (`STAFF_EVENT_KILLS_BURST` `10` plus one per `STAFF_EVENT_KILL_MS` `250` ms). `staffMidsDue` triggers mid bosses at `round(m * i / (mb + 1))` kills, and `staffBossCall` calls a main boss every `e.m` kills after the prior boss falls plus each staff `boss` operation (`fb`). The cell syncs with the hub immediately on boss transitions or every `STAFF_EVENT_TELL_MS` (`3` s) via `/internal/sev/book`, `/internal/sev/tell`, and `/internal/sev/call`.
