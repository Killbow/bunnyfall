---
slug: seat-lease-single-settler
title: "Charter Seat Single-Settler Lease Table"
domain: seats
kind: subcard
parent: seat-turning-settle-and-chunking-overview
files:
  - server-account/src/seatTurning.js
  - server-account/src/routes/seatsRoutes.js
  - server-account/src/routeStatus.js
  - server-account/src/cron.js
  - server-account/migrations/0110_seat_settling.sql
routes:
  - /v1/seats/list
  - /v1/seats/standings
  - /v1/seats/records
  - /v1/seats/forts
tables:
  - town_seat_settling
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-11h.md"
related:
  - seat-turning-settle-and-chunking-overview
  - seats-weekly-turning-and-holding
invariants:
  - "`settleDueOnce` reads the lease row (`id = 1`) before `INSERT` to avoid write contention."
  - "Lease lasts `SETTLE_LEASE_S = 60` and is deleted by holder when done; a crashed settler lease expires."
traps:
  - "While pending, non-read seat routes return `503` `seats-settling`; only paths in `SEAT_READS` answer the unsettled state."
dfu: []
tags:
  - lease
  - turning
  - concurrency
---

# Charter Seat Single-Settler Lease Table

Without mutual exclusion, every request arriving after the Sunday Turning boundary would launch a full weekly settlement in parallel, saturating the D1 primary write queue. Migration `server-account/migrations/0110_seat_settling.sql` and `server-account/src/seatTurning.js` serialize Turning execution through the single-row `town_seat_settling` lease table.

- **Read-before-write lease acquisition:** When `settleDueOnce` runs (triggered either by the `'seats'` scheduled job in `server-account/src/cron.js` when `SEATS_OPEN` is enabled or by an incoming `/v1/seats/*` request), it first reads row `id = 1` from `town_seat_settling`. Checking the existing row before attempting an `INSERT` prevents write contention while another isolate is already settling.
- **Expiration and cleanup:** The winning settler writes a lease valid for `SETTLE_LEASE_S = 60` seconds and deletes row `id = 1` upon completion. If the settling Worker isolate crashes or hits a timeout mid-run, the lease expires after `SETTLE_LEASE_S`, allowing a subsequent request or cron tick to take over and finish the idempotent settlement.
- **Route gating during settlement:** In `server-account/src/routes/seatsRoutes.js` and `server-account/src/routeStatus.js`, when a Turning is due or actively settling under another holder, only paths in `SEAT_READS` (`/v1/seats/list`, `/v1/seats/standings`, `/v1/seats/records`, and `/v1/seats/forts`) proceed to serve the prior state; all other seat routes immediately return HTTP `503` (`seats-settling`).
