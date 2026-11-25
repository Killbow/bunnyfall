---
slug: scale-arc-capacity-plan
title: "Scale Arc: Capacity Plan from 500 to 10,000 Concurrent"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/accountClient.js
  - src/net/online.js
  - src/net/reconnectWave.js
  - src/net/heartbeat.js
  - src/player/doorTokenHost.js
  - src/net/renownTracker.js
  - src/net/renown.js
  - server-account/wrangler.toml
  - selfhost/upstream-ci/workflows/account-deploy.yml
routes:
  - /v1/auth/token
  - /v1/heartbeat
  - /v1/renown/xp
replacesBible:
  - "11-Multiplayer/Scale-Arc.md"
related:
  - scale-arc-d1-replicas-and-shedding
  - scale-arc-d1-write-diet-and-cron
  - scale-arc-relay-hot-path-and-wire2
  - scale-arc-hub-pull-layers-and-cells
  - room-engine-and-hub-sharding
  - account-routes-and-gate-wall
  - identity-tokens-and-relay-seam
invariants:
  - "A minted relay token is reused across rooms for the same sign-in and character for `TOKEN_REUSE_MS` (`60000`) in `accountTokenMinter` (`src/net/accountClient.js`), and concurrent socket opens share a single in-flight mint."
  - "Reconnect waves spread when two or more sockets drop within `WAVE_WINDOW_MS` (`2000`) while online, capped at `WAVE_SPREAD_MAX_MS` (`40000`) via `waveSpreadMs` (`src/net/reconnectWave.js`)."
  - "Heartbeat parts attach to an outgoing beat due within `RIDE_EARLY_MS` (`5000`), while play beats wait up to `BEAT_RIDE_MS` (`120000`) minus `BEAT_GRACE_MARGIN_MS` (`15000`)."
  - "Renown XP reports coalesce for `RENOWN_COALESCE_MS` (`300000`) unless `renownReportSoon` indicates an approaching hour boundary (`RENOWN_REPORT_MS = 60000`)."
traps:
  - "Every relay deploy drops all open WebSockets; batch relay changes into announced maintenance windows."
  - "Browsers emit `error` before `close` on a failed WebSocket; record socket status before `error` so wave detection and fallback handling do not misfire."
  - "Account deploy migrations retry only on overload text (`overloaded|queued for too long`), never on code `7429` CPU resets, backing off at 20, 40, 60, 90, and 120 seconds."
tags:
  - multiplayer
  - scale
  - capacity
  - reconnect
  - tokens
---

The Scale Arc cuts request fan-out, D1 primary load, and Durable Object hot-path costs from 500 to 10,000 concurrent players.

## Client Coalescing and Reconnect Waves

`accountTokenMinter` (`src/net/accountClient.js`) reuses `/v1/auth/token` grants for `TOKEN_REUSE_MS = 60000` across rooms sharing a sign-in and character, sharing one in-flight mint. `src/player/doorTokenHost.js` prefetches tokens near exits (`DOOR_SOON_MS = 2000`, `EXIT_WALK_MS = 8000`, `EXIT_NEAR_M = 16`, `EXIT_ARM_M = 32`, and `DOOR_PENDING_MS = 30000`).

When two or more sockets drop within `WAVE_WINDOW_MS = 2000` (`src/net/online.js` and `src/net/reconnectWave.js`), `waveSpreadMs` spreads reconnects up to `WAVE_SPREAD_MAX_MS = 40000`. Outgoing `/v1/heartbeat` calls (`src/net/heartbeat.js`: `createHeartbeat`, `whileLive`, and `partAnswer`) attach parts due within `RIDE_EARLY_MS = 5000` and hold play beats up to `BEAT_RIDE_MS = 120000` less `BEAT_GRACE_MARGIN_MS = 15000`. In `src/net/renown.js` and `src/net/renownTracker.js`, `/v1/renown/xp` coalesces for `RENOWN_COALESCE_MS = 300000` unless `renownReportSoon` nears the hour mark (`RENOWN_REPORT_MS = 60000`).

## Placement, Deploys, and Subcards

`server-account/wrangler.toml` pins `[placement] region = "aws:us-west-1"`, runs `* * * * *` and `41 * * * *` crons, and writes Analytics Engine datasets (`daggerfall_accounts` and `daggerfall_relay`). `selfhost/upstream-ci/workflows/account-deploy.yml` retries overloaded migrations at 20, 40, 60, 90, and 120 seconds.

- `scale-arc-d1-replicas-and-shedding`: replica bookmarks, session passes, and shedding.
- `scale-arc-d1-write-diet-and-cron`: session touches, cron caps, and board caches.
- `scale-arc-relay-hot-path-and-wire2`: Wire 2 poses, lazy attachments, and enemy budgets.
- `scale-arc-hub-pull-layers-and-cells`: hub polling, room layers, gate copies, and adaptive cells.
