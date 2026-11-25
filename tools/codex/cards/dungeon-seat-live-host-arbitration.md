---
slug: dungeon-seat-live-host-arbitration
title: "Dungeon Seat Among the Live Sockets (SEAT-LIVE)"
domain: multiplayer
kind: subcard
parent: craft-how-hitch-counter-home-stations-and-slowfall-leap-overview
files:
  - src/net/seatLive.js
  - src/net/online.js
  - src/net/wire.js
  - src/scenes/world.js
  - server/src/index.js
  - server/src/room/seats.js
  - server/src/room/lifecycle.js
  - server/src/message/dispatch.js
  - server/src/worker/entry.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-18d.md"
related:
  - craft-how-hitch-counter-home-stations-and-slowfall-leap-overview
  - online-coop-shared-dungeon-and-interior-rooms
  - dungeon-sizing-and-online-quest-relay
invariants:
  - "`seatStreams(key)` (`src/net/seatLive.js`) is true only for `dungeon:` world rooms; building and other rooms keep eldest-socket seniority."
  - "`seatOf(list, now)` selects the eldest `hello`-authenticated socket not silent past `FOES_STALE_MS` (falling back to overall eldest if all are silent, breaking ties by `seatElder`)."
  - "In `server/src/room/seats.js`, `_hostOf` memoizes `_hostWalk` until `_seatStale`, `_seatHeard` timestamps seat traffic, `_seatAfter` and `_seatKeep` re-stamp sockets returning after `FOES_STALE_MS` silence behind the live seat, and `_leaveMovesSeat` broadcasts host handoffs."
  - "Client `_askSeat` (`src/net/online.js`) resends pose on `seatAskDue` paced by `FOES_FULL_MS`, `createSeatClock` (`src/scenes/world.js`) ignores local hidden-tab gaps, and `relaySupportsSeatLive` requires `SEAT_RELAY_MIN = 220` via `/health`."
traps:
  - "Do not hardcode the relay version string; compare with `relaySupportsSeatLive` and `SEAT_RELAY_MIN`."
  - "`_hostWalk`, `_leads`, `_seatStale`, `_seatHeard`, `_seatAfter`, and `_seatKeep` live in `server/src/room/seats.js`, not `server/src/index.js` (which holds only `_hostMemo`)."
dfu: []
tags:
  - seat-live
  - host-arbitration
  - dungeon-rooms
  - relay
---

# Dungeon Seat Among the Live Sockets (SEAT-LIVE)

Live-socket dungeon seat arbitration (`SEAT-LIVE`) prevents backgrounded or silent dungeon hosts from stalling layout enemy streams across `src/net/seatLive.js`, `src/net/online.js`, `src/net/wire.js`, `src/scenes/world.js`, `server/src/index.js`, `server/src/room/seats.js`, `server/src/room/lifecycle.js`, `server/src/message/dispatch.js`, and `server/src/worker/entry.js`.

## Pure Seat Selection (`seatLive.js`) and Relay Room State (`seats.js`)

- **Dungeon-only streaming scope:** `seatStreams(key)` in `src/net/seatLive.js` returns `true` only for `dungeon:` world rooms; interior building rooms and other room types retain strict eldest-socket seniority. `seatOf(list, now)` picks the eldest `hello`-authenticated socket that has not been silent past `FOES_STALE_MS` (re-exported with `FOES_FULL_MS` from `src/net/wire.js` via `src/net/online.js`), falling back to the overall eldest socket if every peer is silent and breaking ties with `seatElder`.
- **Server seat tracking:** In `server/src/room/seats.js` (while `server/src/index.js` holds only `_hostMemo`), `_hostOf` memoizes `_hostWalk` until `_seatStale`, `_seatHeard` timestamps incoming seat traffic, `_seatAfter` and `_seatKeep` re-stamp any socket returning after `FOES_STALE_MS` of silence behind the active live seat, and `_leaveMovesSeat` broadcasts host handoffs on disconnect.

## Client Seat Clock and Version Gate

In `src/net/online.js`, `_askSeat` resends pose on `seatAskDue` paced by `FOES_FULL_MS`, while `createSeatClock` (`src/scenes/world.js`) ignores local hidden-tab gaps. Always check relay compatibility through `relaySupportsSeatLive` (`SEAT_RELAY_MIN = 220` via `/health`) rather than hardcoding a relay version literal.
