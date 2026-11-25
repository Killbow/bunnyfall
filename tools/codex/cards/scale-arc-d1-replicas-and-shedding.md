---
slug: scale-arc-d1-replicas-and-shedding
title: "D1 Read Replicas, Bookmarks, Busy Gate, and Slow Shed"
domain: account
kind: subcard
parent: scale-arc-capacity-plan
files:
  - server-account/src/service.js
  - server-account/src/metrics.js
  - server-account/src/sessionPass.js
  - src/net/sessionPassLaw.js
  - src/net/busyLaw.js
  - src/net/accountClient.js
  - server-account/src/index.js
routes:
  - /v1/auth/token
  - /v1/heartbeat
  - /v1/account
  - /v1/homes/town
  - /v1/homes/decor
  - /v1/seats/list
  - /v1/prof/pixels
  - /v1/prof/motherlodes
  - /v1/market/vendors
tables:
  - sessions
  - players
replacesBible:
  - "11-Multiplayer/Scale-Arc.md"
related:
  - scale-arc-capacity-plan
  - scale-arc-d1-write-diet-and-cron
  - account-routes-and-gate-wall
invariants:
  - "`REPLICA_ROUTES` run on a D1 Sessions API session seeded by the client's `x-d1-bookmark`, while `PRIMARY_FIRST_ROUTES` (`/v1/auth/token`) open with `first-primary`."
  - "`BUSY_READS` (`src/net/busyLaw.js`) is shared by client and server: on HTTP `503` with `Retry-After` `BUSY_RETRY_AFTER_S` (`5`), the client hold doubles from `BUSY_BASE_MS` (`5000`) up to `BUSY_MAX_MS` (`60000`), and the server sheds those routes for `BUSY_SHED_MS` (`10000`)."
  - "Slow-shed triggers when at least `SLOW_SHED_MIN` (`16`) D1 queries within `SLOW_SHED_SPAN_MS` (`30000`) average at least `SLOW_SHED_WAIT_MS` (`1000`), with each sample capped at `SLOW_SHED_TRIP_CAP_MS` (`5000`) in `noteD1Wait`."
  - "Session passes (`PASS_TTL_S = 300`, `PASS_RENEW_S = 60`, and `PASS_MAX_CHARS = 1024`) are minted only from primary D1 lookups."
traps:
  - "Unconstrained polled replica reads (`ANY_REPLICA_ROUTES`, kept empty) cause a bookmark spiral where slow primary responses advance `_d1Era` and force subsequent reads back to primary."
  - "`d1Overloaded` matches error code `7429`, which also fires on Worker CPU-limit resets."
tags:
  - account
  - d1
  - replicas
  - backoff
  - shedding
---

`server-account/src/service.js`, `server-account/src/index.js`, and `src/net/accountClient.js` shift read traffic onto D1 read replicas, cache session authentication in signed passes, and shed non-essential reads before primary queue delays cascade.

## Replica Sessions, Bookmarks, and Session Passes

Routes listed in `REPLICA_ROUTES` open a D1 Sessions API handle using the client's `x-d1-bookmark` header, whereas `PRIMARY_FIRST_ROUTES` (`/v1/auth/token`) target `first-primary`. On the client, `src/net/accountClient.js` updates its stored bookmark only for `D1_BOOKMARK_READS` (`/v1/heartbeat`, `/v1/account`, and `/v1/auth/token`). Calling `forgetD1Bookmark` increments `_d1Era` so in-flight responses from an older era cannot overwrite the bookmark; `ANY_REPLICA_ROUTES` stays empty to avoid bookmark spirals from background polling.

To avoid querying `sessions` and `players` on every request, `server-account/src/sessionPass.js` and `src/net/sessionPassLaw.js` issue signed session passes (`PASS_TTL_S = 300`, `PASS_RENEW_S = 60`, and `PASS_MAX_CHARS = 1024`), minting them exclusively after a verified primary lookup.

## Busy Gate, Slow Shed, and Write Accounting

`src/net/busyLaw.js` defines `BUSY_READS` (`/v1/homes/town`, `/v1/homes/decor`, `/v1/seats/list`, `/v1/prof/pixels`, `/v1/prof/motherlodes`, and `/v1/market/vendors`). When D1 throws an overload (`d1Overloaded`, matching queue timeouts and code `7429`) or `noteD1Wait` records at least `SLOW_SHED_MIN = 16` D1 trips in `SLOW_SHED_SPAN_MS = 30000` averaging at least `SLOW_SHED_WAIT_MS = 1000` (with individual trips capped at `SLOW_SHED_TRIP_CAP_MS = 5000`), the server sheds `BUSY_READS` for `BUSY_SHED_MS = 10000` with HTTP `503` and `Retry-After: 5` (`BUSY_RETRY_AFTER_S`). Clients back off from `BUSY_BASE_MS = 5000` up to `BUSY_MAX_MS = 60000`.

In `server-account/src/metrics.js`, `countedDb`, `timedStatement`, and `tableOf` attribute row reads and writes per table for Analytics Engine telemetry.
