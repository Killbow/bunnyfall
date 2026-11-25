---
slug: spawn-grants-ask-protocol-and-owner-host
title: "Grant Requests, Token Buckets, Cell Ceiling, and Owner Host"
domain: multiplayer
kind: subcard
parent: spawn-grants-overview
files:
  - src/net/grantLaw.js
  - src/net/grantHost.js
  - src/net/online.js
  - server/src/index.js
  - src/characters/exteriorFoes.js
  - src/scenes/dungeonContext.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Spawn-Grants.md"
related:
  - spawn-grants-overview
  - spawn-grants-signed-grant-and-dice
  - room-engine-and-hub-sharding
invariants:
  - "WebSocket `grant` frames accept request kinds `mint`, `renew`, `free`, `carry`, `heir`, and `tally` (`validGrantAsk`) and emit response kinds `ok`, `no`, `off`, `renew`, `carry`, and `heir` (`validGrantOut`)."
  - "`grantMintGate` evaluates kind, batch size, cell ceiling, and account bucket in that exact order, checking the cell ceiling before deducting bucket tokens."
  - "Per-account per-kind token buckets use `GRANT_KINDS` (`max`, `rate`, `cap`, and `hostile`), while active hostile members in a cell cannot exceed `GRANT_CELL_CEILING` (`192`)."
  - "Open-world kinds in `GRANT_OPEN_KINDS` (`enc`, `camp`, `bounty`, `giant`, `encr`, and `star`) are rejected inside world rooms; clients never request `encr` directly because `grantKindRolled` assigns it when `grantRoll` is enabled."
  - "Explicit `no` refusals are sent only in `enforce` mode, and incoming `grant` frames are rate-limited by `grantGate` (`GRANT_HZ_MAX = 2`, `GRANT_BURST_MAX = 8`)."
traps:
  - "An enemy spawn whose grant does not arrive within `GRANT_WAIT_MS` (`1500` ms) proceeds ungranted unless the relay is in `enforce` mode, where the owning client drops the spawn."
  - "Renewals batch up to `GRANT_RENEW_MAX` (`32`) grants within `GRANT_RENEW_LEAD_MS` (`2` minutes) of expiry and preserve the original issue time `h` via `grantRenewed`."
  - "Refused `watch` requests retry after `GRANT_WATCH_REASK_MS` (`30` s), cell carries retry up to `GRANT_CARRY_TRIES` (`3`) times, and heir handoffs wait `GRANT_HEIR_WAIT_MS` (`10` s)."
dfu: []
tags:
  - spawn-grants
  - websocket
  - token-bucket
  - handoff
---

`src/net/grantHost.js` and `src/net/online.js` coordinate spawn grant requests with the cell relay (`server/src/index.js`) for exterior and dungeon spawns (`src/characters/exteriorFoes.js` and `src/scenes/dungeonContext.js`).

## Mint Gate, Buckets, and Ceiling

Incoming `grant` frames (`validGrantAsk`) pass through `grantGate` (`GRANT_HZ_MAX = 2`, `GRANT_BURST_MAX = 8`) and carry at most `GRANT_FRAME_GRANTS_MAX` (`32`) grants per frame. On a `mint` request, `grantMintGate` checks:
1. Valid kind (rejecting `GRANT_OPEN_KINDS` - `enc`, `camp`, `bounty`, `giant`, `encr`, and `star` - inside world rooms, and substituting `encr` via `grantKindRolled` when `grantRoll` is active).
2. Requested member count against the `max` field for that kind.
3. Cell hostile population against `GRANT_CELL_CEILING` (`192`).
4. Per-account per-kind token bucket in `GRANT_KINDS` (`rate`, `cap`, and `hostile`).

Relays cache grant configuration for `GRANT_CFG_TTL_MS` (`5` minutes) and emit `no` responses only while enforcing.

## Owner Batching, Renewals, and Handoffs

`memberFor` groups same-turn spawns of one kind into a single `mint` request and waits up to `GRANT_WAIT_MS` (`1500` ms). Live grants renew in batches of up to `GRANT_RENEW_MAX` (`32`) within `GRANT_RENEW_LEAD_MS` (`2` minutes) of expiry (`grantRenewed`, keeping `h`) and release early via `free`. Cross-cell `carry` requests retry `GRANT_CARRY_TRIES` (`3`) times, `heir` transfers wait `GRANT_HEIR_WAIT_MS` (`10` s), and refused `watch` spawns re-request after `GRANT_WATCH_REASK_MS` (`30` s).
