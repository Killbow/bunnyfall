---
slug: online-coop-overview
title: "Online Co-op: Shared World over Local Saves"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/online.js
  - src/net/wire.js
  - src/net/onlineWorld.js
  - src/platform/onlineLane.js
  - src/platform/appStorage.js
  - server/src/index.js
  - server/src/worker/entry.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Arc.md"
related:
  - online-coop-peer-presence-and-crowd-fans
  - online-coop-shared-dungeon-and-interior-rooms
  - online-coop-cell-enemies-halo-and-hits
  - online-coop-party-quest-trade-and-ally-cast
  - online-coop-death-rest-and-room-lanes
  - wire-protocol-and-frame-dispatch
  - room-engine-and-hub-sharding
  - online-time-arc-overview
  - homes-camps-guilds-and-territories
  - seats-arc-overview
  - professions-arc-overview
invariants:
  - "src/net/wire.js is the single source of truth for wire schemas, bounds, and rate gates shared by the client (src/net/online.js) and the relay (server/src/relay.js re-exports it)."
  - "Each tab mints its own peerId and secret in tabStorage (src/platform/appStorage.js), so separate tabs are distinct players."
  - "Saves stay local: the relay never stores a save. It layers presence, chat, room memory, and enemy streams over each player's own world state."
  - "Every incoming payload is projected and clamped by wire.js validators at both ends, and frames are size-checked against MAX_FRAME_BYTES (16 KiB) before parsing."
traps:
  - "Never hardcode the relay version string. Read RELAY_VERSION from wire.js, which /health also reports."
  - "Do not hardcode relay hostnames in docs or code paths."
dfu: []
tags:
  - online
  - multiplayer
  - co-op
  - relay
  - overview
---

# Online Co-op: Shared World over Local Saves

Online co-op layers shared presence, chat, room memory, and enemy streams over each player's local world state without storing saves on the relay. Client orchestration in `src/net/online.js` and `src/net/onlineWorld.js` connects to Cloudflare Durable Object rooms (`server/src/index.js`) through the worker entrypoint (`server/src/worker/entry.js`), while `src/net/wire.js` defines shared schemas, bounds, and rate gates.

## Identity, Rooms, and Enemy Streaming

- **Per-tab identity:** Each browser tab mints an isolated `peerId` and `secret` in `tabStorage` (`src/platform/appStorage.js`), treating separate tabs as distinct connected peers while enforcing `src/platform/onlineLane.js` session constraints.
- **Room routing (`roomKeyFor` in `src/net/online.js`):** Peers join outdoor cells (`world:<cx>,<cy>`), dungeons (`dungeon:m<mapId>`), shared interiors (`interior:m<mapId>.<buildingKey>`), and global or channel chat rooms (`CHAT_ROOMS`).
- **Capacity and frame bounds (`src/net/wire.js`):** Each room admits up to `SOCKETS_MAX` (`256`) sockets and welcomes the nearest `ROSTER_MAX` (`64`) peers. Incoming frames are checked against `MAX_FRAME_BYTES` (`16 KiB`) before parsing and clamped by `wire.js` validators on both ends.
- **Enemy streaming (`streamsFoes` in `src/net/wire.js`):** `streamsFoes(key)` returns `isWorldRoom(key) || isCellRoom(key)`, enabling synchronized enemy authority across dungeons, shared interiors, and outdoor cells.
- **Relay health probe (`server/src/worker/entry.js`):** The worker `/health` HTTP endpoint returns `{ ok, service, version: RELAY_VERSION, t }`, sourcing `RELAY_VERSION` directly from `src/net/wire.js`.

## Subcards

- `online-coop-peer-presence-and-crowd-fans`
- `online-coop-shared-dungeon-and-interior-rooms`
- `online-coop-cell-enemies-halo-and-hits`
- `online-coop-party-quest-trade-and-ally-cast`
- `online-coop-death-rest-and-room-lanes`
