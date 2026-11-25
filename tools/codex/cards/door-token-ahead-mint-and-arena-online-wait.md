---
slug: door-token-ahead-mint-and-arena-online-wait
title: "Door Tokens Minted Ahead and the Online Arena's Welcome Wait"
domain: multiplayer
kind: subcard
parent: theft-law-indoor-watch-and-door-tokens-overview
files:
  - src/player/doorTokenHost.js
  - src/net/accountClient.js
  - src/net/online.js
  - src/arena/arenaOnline.js
  - src/arena/arenaGate.js
  - src/arena/arenaBoard.js
  - src/ui/arenaWindow.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-16b.md"
related:
  - theft-law-indoor-watch-and-door-tokens-overview
  - identity-tokens-and-relay-seam
  - arena-relay-rooms-and-private-sessions
  - arena-ladder-banners-and-claims
  - scene-router-and-boot-doors
invariants:
  - "`createDoorToken` asks `minter.ahead(room, withinMs)` on entering, leaving and jumping with `DOOR_SOON_MS` (2 s), and on approaching an exit with `EXIT_WALK_MS` (8 s), once per visit."
  - "A place change stays pending, re-asked each frame, for at most `DOOR_PENDING_MS` (30 s)."
  - "`ahead` mints only when the token already held could not open the next room by the time its socket asks."
  - "A hello refused for lack of a token (`CLOSE_POLICY` with `tokenRetryable`) sets `_tokenRetry` and retries on the frame `minter.holds(room)` becomes true, skipping the backoff."
  - "On the online lane, arena `shut()` returns 'wait' (no session, or no primary welcome yet: `arenaHeard` false), 'seat' (superseded) or 'gone' (terminal). It returns null only when live, off the lane, or after a welcome that said `arenaOk` false."
  - "While shut, `ladderPageWaiting` and `ladderCardWaiting` draw placeholders with no title, banner or purse."
traps:
  - "Never fall back to the offline save ladder or a local bout during the welcome wait; it paid purses into the realm save."
  - "A single wide ahead-margin double-minted on slow walks; keep the door and walk margins separate."
  - "Do not hardcode relay version strings; arena support comes from `relaySupportsArena`."
dfu: []
tags:
  - identity-token
  - relay
  - arena
  - online
  - presence
---

# Door Tokens Minted Ahead and the Online Arena's Welcome Wait

Room transitions pre-mint relay door tokens before the socket connects, and the online arena gates its UI and bouts until the primary relay welcome confirms arena availability.

- **Pre-minting door tokens:** In `src/player/doorTokenHost.js` and `src/net/accountClient.js`, `createDoorToken` calls `minter.ahead(room, withinMs)` with `DOOR_SOON_MS` (2000 ms) when entering, leaving, or jumping, and with `EXIT_WALK_MS` (8000 ms) once per visit when walking near an exit. Keeping those two margins separate prevents double-minting during slow walks. A pending place change re-queries each frame for up to `DOOR_PENDING_MS` (30000 ms), and `ahead` mints only if the currently held token would expire before the next room socket opens. Offline sessions skip ahead-minting.
- **Immediate token retry:** In `src/net/online.js`, if a room hello closes with `CLOSE_POLICY` and `tokenRetryable`, the client sets `_tokenRetry` and reconnects on the exact frame `minter.holds(room)` turns true, bypassing reconnect backoff.
- **Online arena welcome wait:** In `src/arena/arenaOnline.js`, `src/arena/arenaGate.js`, `src/arena/arenaBoard.js`, and `src/ui/arenaWindow.js`, `arenaHeard` latches true once a primary welcome arrives and is checked via `relaySupportsArena`. On the online lane, `shut()` returns `'wait'` before a session or welcome arrives (`arenaHeard` false), `'seat'` when superseded, `'gone'` when terminal, and `null` only when live, offline, or after a welcome with `arenaOk: false`. While shut, `shutText` displays `SEAT_NOTICE`, `noServer`, or the wait strings (`climbWait`, `hallWait`, `rollWait`), and `ladderPageWaiting` plus `ladderCardWaiting` render blank placeholders without falling back to local bouts or offline purses.
