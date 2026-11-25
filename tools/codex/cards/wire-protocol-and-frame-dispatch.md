---
slug: wire-protocol-and-frame-dispatch
title: Wire Protocol and Relay Frame Dispatch
domain: multiplayer
kind: overview
files:
  - src/net/wire.js
  - src/net/online.js
  - server/src/relay.js
  - server/src/index.js
related:
  - identity-tokens-and-relay-seam
  - room-engine-and-hub-sharding
invariants:
  - "`src/net/wire.js` (re-exported by `server/src/relay.js`) stays pure with zero DOM or database imports so client and relay enforce identical validation and rate limits."
  - Every WebSocket must pass `hello` within `HELLO_WAIT_MS`, proving its identity token and binding a reconnect `secret` to its peer `id`.
  - "`Room._message` (`server/src/index.js`) enforces prefix budgets (`quest`, `own`, `world`, `foes`) before `parseClient` parses JSON."
traps:
  - Editing any module in the relay bundle graph bumps `RELAY_VERSION` and disconnects active WebSocket rooms on deploy.
  - Non-host `world` frames count as junk strikes via `_junk` rather than disconnecting immediately, avoiding false drops during host handovers.
tags:
  - multiplayer
  - wire
  - websocket
  - frames
  - rate-limits
---

# Wire Protocol and Relay Frame Dispatch

`src/net/wire.js` (re-exported by `server/src/relay.js`) defines the JSON WebSocket protocol, pure validators, and token-bucket rate gates shared by the browser (`src/net/online.js`) and the relay Worker (`server/src/index.js`).

- **Shared bundle boundary:** `src/net/wire.js` must stay pure, with zero DOM or database imports. Editing any file in the relay module graph bumps `RELAY_VERSION` and disconnects active WebSocket rooms on deploy.
- **Handshake (`Room._message` and `_named` in `server/src/index.js`):** Every socket must send `hello` within `HELLO_WAIT_MS` first, proving its signed identity token via `verifyToken` and binding a reconnect `secret` to its public peer `id` to prevent peer impersonation.
- **Pre-parse gates and dispatch (`Room._message`):** `_message` checks oversized prefixes (`QUEST_PREFIX`, `OWN_PREFIX`, `WORLD_PREFIX`, and `FOES_PREFIX`) against room byte budgets before `parseClient` runs, checks room leases (`_leaseHeard`) and freezes (`frozenFrame`), handles `hello`, `lease`, and `pose`/`ping` (`_poseFrame`), and dispatches the remaining 54 frame types inside `Room`.
- **Rate buckets (`Room._spend`):** `_spend` enforces per-socket buckets (such as `poseGate`, `foesGate`, `actGate`, `socialGate`, `tradeGate`, and `castGate`) and closes sockets past `DROP_STRIKES_MAX`. Non-host `world` frames count as junk (`_junk`) instead of closing immediately, avoiding handover disconnects.
