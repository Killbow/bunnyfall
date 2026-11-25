---
slug: online-coop-peer-presence-and-crowd-fans
title: "Peer Presence: Poses, Heartbeats, Crowd Fans, Bodies, and One Seat"
domain: multiplayer
kind: subcard
parent: online-coop-overview
files:
  - src/net/wire.js
  - src/net/online.js
  - src/net/remotePlayers.js
  - src/net/peerBodies.js
  - src/net/oneSeat.js
  - src/net/chat.js
  - server/src/index.js
  - server/src/room/meters.js
  - server/src/message/frames/hello.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Arc.md"
related:
  - online-coop-overview
  - scale-arc-relay-hot-path-and-wire2
  - characters-paperdoll-and-bodies
  - chat-safety-overview
invariants:
  - "Far-tier pose slicing buckets listeners by hashKey(id) mod POSE_FAR_SHARE (4), not by volatile distance rank."
  - "Keepalive and stop poses bypass far-tier slicing on a KEEPALIVE_FAN_MS floor (HEARTBEAT_MS / 2), so standing peers never outlive PEER_TIMEOUT_MS (4 * HEARTBEAT_MS)."
  - "Every per-socket rate meter lives in the Room's in-memory WeakMap (_meters, read through _meterOf in server/src/room/meters.js), never on the 2 KiB hibernatable attachment."
  - "Hello chooses the nearest ROSTER_MAX peers before one batched storage.get of looks, so ROSTER_MAX must stay at or below 128."
  - "One Seat: a newer tab claims the account's seat. The older tab closes with CLOSE_REPLACED (4000), and BroadcastChannel provides a client-side fast path (src/net/oneSeat.js)."
traps:
  - "If HEARTBEAT_MS equals PEER_TIMEOUT_MS / POSE_FAR_SHARE, far-tier standing peers blink out."
  - "A meter kept on the attachment fails silently past 2 KiB and opens every rate gate (AUDIT ATTACH)."
dfu: []
tags:
  - poses
  - presence
  - crowd
  - hibernation
  - paperdoll
  - one-seat
---

# Peer Presence: Poses, Heartbeats, Crowd Fans, Bodies, and One Seat

Room presence balances movement updates against Durable Object hibernation limits and crowd bandwidth ceilings.

## Pose Cadence, Far-Tier Slicing, and Rate Meters

- **Send cadence (`src/net/online.js`, `src/net/wire.js`):** Clients send poses at `POSE_HZ` (`10` Hz, relay cap `POSE_HZ_MAX = 20`) and throttle toward `POSE_HZ_MIN` (`4` Hz) at `POSE_CROWD` (`24`).
- **Crowd fan-out (`server/src/index.js`):** Poses reach at most `POSE_FAN_MAX` (`32`) peers, bucketing far-tier listeners by `hashKey(id)` mod `POSE_FAR_SHARE` (`4`). Stop and keepalive poses bypass slicing on a `KEEPALIVE_FAN_MS` floor (`HEARTBEAT_MS / 2`, with `HEARTBEAT_MS = 20000` and `PING_MS = HEARTBEAT_MS / 4`) so idle peers never expire past `PEER_TIMEOUT_MS` (`4 * HEARTBEAT_MS`).
- **Hibernation and meters (`server/src/index.js`, `server/src/room/meters.js`):** `setWebSocketAutoResponse` answers `ping` with `pong` while hibernated. Per-socket rate buckets live in `_meters` (`_meterOf`), keeping attachments under `2 KiB`.

## Roster, Paperdolls, Chat, and One Seat

- **Welcome and bodies (`server/src/message/frames/hello.js`, `src/net/remotePlayers.js`, `src/net/peerBodies.js`):** `hello` picks the nearest `ROSTER_MAX` (`64`, `<= 128`) peers for one batched `storage.get` of looks. Clients render up to `DOLLS_MAX` (`64`) paperdolls and `BODIES_MAX` (`8`) 3D bodies within `BODY_RANGE` (`120`) for `BODY_LINGER_MS` (`15000` ms).
- **Chat and One Seat (`src/net/chat.js`, `src/net/oneSeat.js`):** Chat enforces `CHAT_MAX` (`240`) and reconnects after `CHAT_REJOIN_MS` (`30000` ms). A newer tab claiming a seat closes the older socket with `CLOSE_REPLACED` (`4000`) plus a `BroadcastChannel` fast path.
