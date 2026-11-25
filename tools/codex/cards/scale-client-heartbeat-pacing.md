---
slug: scale-client-heartbeat-pacing
title: "Client Heartbeat Pacing and Isolation"
domain: client-net
kind: subcard
parent: scale-clock-budget-and-heartbeat-overview
files:
  - src/net/heartbeat.js
  - src/net/accountClient.js
  - src/net/playClock.js
  - src/net/mail.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/worldModes.js
  - src/scenes/dungeonContext.js
routes:
  - /v1/heartbeat
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Scale.md"
related:
  - scale-clock-budget-and-heartbeat-overview
  - account-titles-glyphs-and-play-clock
invariants:
  - "Later knocks are scheduled BEAT_GRACE_MARGIN_MS (15_000) short of PLAY_GRACE_S (2 * PLAY_BEAT_S, PLAY_BEAT_S = 300)."
  - "Requests time out via AbortSignal.timeout with ACCOUNT_ACT_WAIT_MS = 15_000."
  - "mail.js shares one in-flight look (_looking) so heartbeat and Letters refresh cannot roll back out of order."
  - "Scene hosts keep no independent clock; the heartbeat owns them."
traps:
  - "Only whole-request failures are retried; part errors are the answer for that part."
  - "Pacing counts from send moment, not answer moment."
dfu: []
tags:
  - heartbeat
  - play-clock
  - mail
---

# Client Heartbeat Pacing and Isolation

The client consolidates play-clock and mail polling into a single `/v1/heartbeat` scheduler in `src/net/heartbeat.js` and `src/net/accountClient.js`, removing independent scene timers from `src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, and `src/scenes/dungeonContext.js`.

- **Grace-Bounded Pacing (`src/net/heartbeat.js`, `src/net/playClock.js`):** After the initial knock, subsequent `/v1/heartbeat` calls are scheduled `BEAT_GRACE_MARGIN_MS` (`15_000` ms) short of `PLAY_GRACE_S` (`2 * PLAY_BEAT_S`, with `PLAY_BEAT_S = 300` s). Pacing is measured from the request send moment rather than the response arrival moment, and signing out mid-wait loses at most `PLAY_BEAT_S` of play-clock credit. Scene hosts in `src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, and `src/scenes/dungeonContext.js` keep no separate periodic timers of their own.
- **Timeouts and Part Retries (`src/net/heartbeat.js`, `src/net/accountClient.js`):** Heartbeat requests apply `AbortSignal.timeout` with `ACCOUNT_ACT_WAIT_MS = 15_000`. The client retries only when the whole HTTP request fails; if `/v1/heartbeat` succeeds with an error inside an individual part, that error is treated as the answer for that part without triggering a full-request retry.
- **Shared Mail In-Flight Guard (`src/net/mail.js`):** `src/net/mail.js` deduplicates concurrent checks through a single in-flight promise (`_looking`) so a heartbeat tick and a manual Letters UI refresh cannot resolve out of order and roll back newer mail state.
