---
slug: seat-turning-settle-and-chunking-overview
title: "Charter Seat Turning Lease and D1 IN-List Chunking"
domain: seats
kind: overview
parent: null
files:
  - server-account/src/seatInfluence.js
  - server-account/src/seatTurning.js
  - server-account/src/routes/seatsRoutes.js
  - server-account/src/routeStatus.js
  - server-account/src/townSeats.js
  - src/net/townSeatBook.js
  - tools/d1Load.mjs
  - selfhost/upstream-ci/workflows/d1-load.yml
  - server-account/src/metrics.js
  - selfhost/accounts.toml
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
  - seat-cap-d1-bound-in-chunking
  - seat-lease-single-settler
  - seats-weekly-turning-and-holding
  - scale-arc-d1-replicas-and-shedding
  - scale-arc-d1-write-diet-and-cron
invariants:
  - "`settleDue`/`settleDueOnce` runs before every seat route; a settle throw fails the route."
  - "Weekly Turning reads `confirmedSeats` with `{ fresh: true }`, bypassing the isolate-kept facts."
traps:
  - "Toggling `SEATS_OPEN` off answers `seats-closed` without settling - the operator drain for a retry storm."
dfu: []
tags:
  - seats
  - d1
  - turning
---

# Charter Seat Turning Lease and D1 IN-List Chunking

The `field-bugs-2026-10-11h` fixes harden weekly Charter Seat Turning against D1 bound-parameter ceilings, concurrent settlement stampedes, and sampled telemetry skew across `server-account/src/seatInfluence.js`, `server-account/src/seatTurning.js`, `server-account/src/routes/seatsRoutes.js`, and `tools/d1Load.mjs`.

- **Bound IN-list chunking (`SEAT-CAP`):** In `server-account/src/seatInfluence.js` and `server-account/src/seatTurning.js`, `allIn(db, ids, sql, before, after)` splits variable-length guild and player `IN` clauses into batches of `IN_CHUNK = 90` to stay under the 100-parameter D1 ceiling.
- **Single-settler lease and read jitter (`SEAT-LEASE`):** `settleDue` and `settleDueOnce` run ahead of `/v1/seats/*` routes in `server-account/src/routes/seatsRoutes.js` and `server-account/src/routeStatus.js`, coordinating through the single-row `town_seat_settling` table (`SETTLE_LEASE_S = 60`). While a Turning is pending, non-read routes return HTTP `503` (`seats-settling`), whereas `SEAT_READS` (`/v1/seats/list`, `/v1/seats/standings`, `/v1/seats/records`, and `/v1/seats/forts`) serve the unsettled state. During settlement, `server-account/src/townSeats.js` reads `confirmedSeats` with `{ fresh: true }`. Clients (`src/net/townSeatBook.js`) spread Turning list reads across `SEAT_TURN_READ_SPREAD_MS = 120000` and retry failed reads every `SEAT_LIST_RETRY_MS = 60000`. Toggling `SEATS_OPEN` off in `selfhost/accounts.toml` (`SEASON_ZERO_WEEK = "2"`) answers `seats-closed` immediately without running settlement.
- **Weighted D1 load reporting (`D1-LOAD`):** `tools/d1Load.mjs` and `selfhost/upstream-ci/workflows/d1-load.yml` weigh Analytics Engine points from `server-account/src/metrics.js` by `_sample_interval`.
