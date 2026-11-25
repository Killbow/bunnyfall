---
slug: "horse-cart-and-cargo-park-persistence"
title: "HCC-PARK: Parked Teams Kept by the Relay Cell and the Owner Registry"
domain: "multiplayer"
kind: "subcard"
parent: "horse-cart-and-cargo-overview"
files:
  - "src/net/wire.js"
  - "src/net/online.js"
  - "src/net/onlineWorld.js"
  - "src/travel/horseCartPool.js"
  - "server/src/world/park.js"
  - "server/src/room/doors.js"
  - "server/src/cellMoves.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Cart-And-Cargo.md"
related:
  - "horse-cart-and-cargo-online-peer-teams"
  - "horse-cart-and-cargo-overview"
  - "room-engine-and-hub-sharding"
invariants:
  - "`parkKeyOf(sub, c)` hashes `${sub}\\n${c}` with SHA-256 and takes the first 12 bytes (`24` hex chars matching `PARK_KEY_RE`) so raw account subjects never leave the relay."
  - "Cell rooms store parked records under `parkKey(k)` (`park:${k}`) in Durable Object storage (`ParkPart` in `server/src/world/park.js`), routed internally via `/internal/park/registry` and `/internal/park/drop` (`server/src/room/doors.js`)."
  - "Relay bounds enforce `PARK_CELL_MAX = 32` per cell, `PARK_ACCOUNT_MAX = 4` per account, `PARK_TTL_MS = 72` hours, and `PARK_HZ_MAX = 2` frames/s per socket (`parkGate`), gated on `relaySupportsPark` (`PARK_RELAY_MIN = 99`)."
traps:
  - "`parkRegistryRoom(k)` (`parkreg:${k}`) tracks `{ cell, at, ly? }` with an alarm at `at + PARK_TTL_MS` and POSTs `/internal/park/drop` (`PARK_INTERNAL_DROP`) to the prior cell when a team moves."
  - "The relay filters out records owned by the receiving client (local saves remain authoritative for own teams), throttles unchanged refreshes to `PARK_REFRESH_MS` (`10` min), and enforces `PARK_REACH = 8192` natives from the anchor."
dfu: []
tags:
  - "horse-cart-and-cargo"
  - "hcc-park"
  - "relay"
  - "durable-objects"
  - "persistence"
---

# HCC-PARK: Parked Teams Kept by the Relay Cell and the Owner Registry

Parked team persistence spans `src/net/wire.js`, `src/net/online.js`, `src/net/onlineWorld.js`, `src/travel/horseCartPool.js`, `server/src/world/park.js`, `server/src/room/doors.js`, and `server/src/cellMoves.js`.

- **Keys, rooms, and internal doors:** `parkKeyOf(sub, c)` hashes `${sub}\n${c}` with SHA-256 and keeps the first 12 bytes (`24` hex characters matching `PARK_KEY_RE`), keeping raw account subjects off the wire. In `server/src/world/park.js`, `ParkPart` stores deployed records (only kind `2`, `Deployed`, with cargo tiers `{0, 25, 50, 75, 90}`) under `parkKey(k)` (`park:${k}`) inside `cellRoomOfWire(x, z) = worldRoom(trunc(x / PIXEL_UNITS), 499 - trunc(z / PIXEL_UNITS))`. `server/src/room/doors.js` routes `PARK_INTERNAL_REG` (`/internal/park/registry`) and `PARK_INTERNAL_DROP` (`/internal/park/drop`) to `_parkInternal`, while `parkRegistryRoom(k)` (`parkreg:${k}`) tracks `{ cell, at, ly? }`, schedules an expiry alarm at `at + PARK_TTL_MS`, and drops the previous cell record on relocation.
- **Bounds, filtering, and client rendering:** Gated on `relaySupportsPark` (`PARK_RELAY_MIN = 99`), the relay enforces `PARK_CELL_MAX = 32` per cell, `PARK_ACCOUNT_MAX = 4` per account, `PARK_TTL_MS = 72` hours, `PARK_HZ_MAX = 2` frames/s (`parkGate`), `PARK_REFRESH_MS` (`10` min), and `PARK_REACH = 8192` natives. `parkWord(toWire)` builds the client payload; the relay omits the receiver own records, and viewers prefer live `hv` frames over stored records, removing entries on `{ t: 'park', k, id, data: null }`.
