---
slug: room-engine-and-hub-sharding
title: Room Engine, World Authority, and Hub Sharding
domain: multiplayer
kind: overview
files:
  - server/src/index.js
  - server/src/cellHandover.js
  - src/net/hubShards.js
related:
  - identity-tokens-and-relay-seam
  - wire-protocol-and-frame-dispatch
invariants:
  - Per-socket state (`key`, `sub`, reconnect `sc`) rides WebSocket hibernation attachments on `Room` (`server/src/index.js`), while looks (`look:<id>`) and world chunks (`world:meta`, `world:<n>`) persist in Durable Object storage.
  - "`ROSTER_MAX` (`64`) keeps per-hello `storage.get` calls below the 128-key Durable Object batch cap."
  - Cell splits and merges (`server/src/cellHandover.js`) classify every storage key in `KEY_CLASSES` (`part`, `copy`, `drop`, or `block`) and halt if any `block` or unknown key exists.
traps:
  - "`chat:world` shards across `chat:world.0` through `chat:world.15` (`HUB_SHARDS = 16`) via `shardHash(sub)`; shards must push via `HUB_INTERNAL_UP` and long-poll via `HUB_INTERNAL_POLL` so the bus never invokes shards."
  - In dungeon world rooms, only the longest-connected host (`_hostOf()`) publishes `world` and `foes` streams, while any authenticated peer may send `own`, `hit`, and `act`.
tags:
  - multiplayer
  - rooms
  - sharding
  - authority
---

# Room Engine, World Authority, and Hub Sharding

`server/src/index.js` exports `default` (`fetch`) and the `Room` Durable Object, upgrading `/room/<key>` WebSockets across world cells (`world:<cx>,<cy>`), dungeons, towns, interiors, private rooms (`owned:`), event rooms, and whitelisted `CHAT_ROOMS`.

- **Hibernation and storage keys (`server/src/index.js`):** Because Durable Objects hibernate between messages, per-socket state (`key`, `sub`, reconnect `sc`) lives on WebSocket attachments. Paperdolls (`look:<id>`) and dungeon chunks (`world:meta`, `world:<n>`) persist in `this.state.storage`; selecting the nearest `ROSTER_MAX` (`64`) peers before reading looks keeps `storage.get` calls under the `128`-key batch cap.
- **Host vs. peer authority:** In dungeon world rooms, the longest-connected socket (`_hostOf()`) publishes `world` snapshots and `foes` streams. Any peer may send `own` (personal building or quest enemies), `hit` (routed to the enemy owner), and `act` (doors, levers, and loot).
- **Cell handovers (`server/src/cellHandover.js`):** `KEY_CLASSES` classifies cell storage keys as `part` (`park:`, `ow:led`), `copy` (`relaycfg`, `bans`, `freezes`), `drop` (`look:`, `secret:`), or `block`; unlisted keys default to `block` and halt cell splits or merges.
- **16-way hub shards (`src/net/hubShards.js`):** `chat:world` shards across `chat:world.0` through `chat:world.15` via `shardHash(sub)`, forwarding via `ShardSocket`, `HUB_INTERNAL_UP`, and long-polling `HUB_INTERNAL_POLL` in `Room` to avoid nested subrequests.
