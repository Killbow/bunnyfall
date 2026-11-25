---
slug: arena-relay-rooms-and-private-sessions
title: "Arena Relay Rooms, Matchmaking, and Private Sessions"
domain: multiplayer
kind: subcard
parent: arena-colosseum-overview
files:
  - server/src/index.js
  - src/net/arenaBrain.js
  - src/net/arenaLaw.js
  - src/net/arenaLink.js
  - src/net/wire.js
  - src/net/online.js
  - src/ui/arenaSessionButton.js
routes:
  - /internal/arena/open
  - /internal/arena/live
tables: []
replacesBible:
  - "11-Multiplayer/Arena.md"
related:
  - arena-colosseum-overview
  - arena-ladder-banners-and-claims
  - room-engine-and-hub-sharding
  - identity-tokens-and-relay-seam
invariants:
  - "The relay referee in `arenaBrain.js` owns fighter health and clamps combat inputs to `ARENA_HIT_HZ_MAX` (4 hits/s), `ARENA_MELEE_REACH` (2.5 m), `ARENA_BOW_REACH` (60 m), `ARENA_SPEED_MAX` (12.5), and `ARENA_WEAPON_MAX` per template."
  - "An active fighter disconnected for `ARENA_GONE_MS` (15,000 ms) forfeits, and a newly matched bout room that nobody enters within `ARENA_JOIN_WAIT_MS` (45,000 ms) voids."
  - "When a match offer is declined or expires, the hall matchmaker holds that pair apart for `MATCH_REPAIR_MS` (60,000 ms)."
  - "Private session room codes use `ARENA_PRIVATE_CODE_LEN` (6) characters from `ARENA_PRIVATE_CODE_ALPHABET` (excluding `I`, `L`, `O`, `0`, and `1`)."
traps:
  - "All arena relay messages travel inside a single `'arena'` WebSocket frame multiplexed by `ARENA_IN_KINDS` (including `'ps'` with `ARENA_PS_ACTS` `open`, `join`, `pick`, `go`, `void`, `kick`, `close`, and `lock`) and `ARENA_OUT_KINDS` (`st`, `atk`, `pss`)."
  - "When a private session reaches capacity, a new joiner evicts the spectator disconnected longest (never the host or active combatants), and the session kick list is bounded to `ARENA_PRIVATE_KICKED_MAX` (256)."
dfu: []
tags:
  - arena
  - relay
  - matchmaking
  - private-session
  - referee
  - websocket
---

# Arena Relay Rooms, Matchmaking, and Private Sessions

`src/net/arenaLaw.js`, `src/net/arenaBrain.js`, and `server/src/index.js` partition online colosseum traffic across four Durable Object room patterns persisted under `arenahall`, `arenabout`, and `arenasession`: the matchmaking hall (`ARENA_HALL = 'arena:hall'`), rated or ladder bout rooms (`'arena:b'` plus 16 hex digits, `ARENA_BOUT_ROOM_RE`), hourly exhibition rooms (`'arena:x'` plus the hour index, `ARENA_EX_ROOM_RE`), and private sessions (`arenaPrivateRoom(code) = 'arena:p' + code`, `ARENA_PRIVATE_ROOM_RE`). All client-relay messages share the `'arena'` WebSocket frame (`src/net/arenaLink.js`, `src/net/wire.js`, and `src/net/online.js`), while `/internal/arena/open` and `/internal/arena/live` coordinate room creation and live status with the hub.

## Authoritative Referee, Hall Pairing, and Private Codes

- **Combat referee (`src/net/arenaBrain.js`):** The relay tracks authoritative fighter health and bounds incoming `atk` frames to `ARENA_HIT_HZ_MAX` (`4` per second), `ARENA_MELEE_REACH` (`2.5` meters), `ARENA_BOW_REACH` (`60` meters), `ARENA_SPEED_MAX` (`12.5`), and `ARENA_WEAPON_MAX`. A fighter absent for `ARENA_GONE_MS` (`15,000` ms) forfeits, an unclaimed bout room voids after `ARENA_JOIN_WAIT_MS` (`45,000` ms), and declined hall offers cool down for `MATCH_REPAIR_MS` (`60,000` ms).
- **Private sessions (`src/ui/arenaSessionButton.js`):** Hosts open `6`-character rooms (`ARENA_PRIVATE_CODE_LEN`, `ARENA_PRIVATE_CODE_ALPHABET`) holding up to `ARENA_PRIVATE_MEMBERS_MAX` (`62`, `ARENA_SPECTATORS_MAX = 60` plus `2` fighters) with equalized health (`ARENA_PRIVATE_VITALITY = 360`), `ARENA_PRIVATE_HIST_MAX` (`20`), `ARENA_PRIVATE_JOIN_HZ` (`1`), `ARENA_PRIVATE_KEEP_MS` (`5000` ms), `ARENA_PRIVATE_HOST_GONE_MS` (`15` min), and `ARENA_PRIVATE_LIFE_MS` (`8` hours).
