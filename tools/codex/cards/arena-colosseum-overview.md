---
slug: arena-colosseum-overview
title: "Daggerfall Arena Colosseum Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - src/world/arenaCity.js
  - src/arena/arenaBout.js
  - src/arena/arenaLadder.js
  - src/net/arenaLaw.js
  - src/net/arenaBrain.js
  - src/arena/arenaGate.js
  - src/arena/arenaBouts.js
  - src/arena/arenaOnline.js
  - src/ui/arenaWindow.js
  - src/ui/arenaHud.js
  - server-account/src/arena.js
  - server/src/index.js
routes:
  - /v1/arena/claim
  - /v1/arena/board
  - /v1/arena/team
  - /v1/arena/attempt
tables:
  - arena_pve
  - arena_pvp
  - arena_members
  - arena_renown
  - arena_attempts
replacesBible:
  - "11-Multiplayer/Arena.md"
related:
  - arena-city-block-and-home-relocation
  - arena-bout-law-crowd-and-kit
  - arena-ladder-banners-and-claims
  - arena-relay-rooms-and-private-sessions
  - integrity-pvp-duel-and-wild-referees
  - balance-arc-pvp-harm-ceiling-and-archery
invariants:
  - "Arena fighters never die in the ring: combat holds the player at a 1 HP floor, and every bout concludes with a heal phase."
  - "A single shared bout state machine (`newBout` in `src/arena/arenaBout.js`) drives offline ladder, hourly exhibition, and relay bouts, while `arenaBrain` on the relay owns authoritative online state."
  - "Ladder opponents scale strictly with the ladder tier rather than with player character level."
traps:
  - "`ARENA2` cards (`arena2-*`) document classic game data loading, not the Daggerfall City colosseum."
  - "Online colosseum features activate only when `relaySupportsArena()` passes against `ARENA_RELAY_MIN`; never compare literal relay version strings."
dfu: []
tags:
  - arena
  - pvp
  - pve
  - ladder
  - exhibition
  - colosseum
  - multiplayer
---

# Daggerfall Arena Colosseum Overview

The Daggerfall Arena Colosseum (`src/world/arenaCity.js`, `src/net/arenaLaw.js`, and `src/arena/arenaBout.js`) provides non-lethal arena combat across three bout modes (`ARENA_KINDS`: `pve` ladder, `pvp` matchmaking and private bouts, and `ex` hourly exhibitions). Combatants never die on the sand; incoming damage stops at a `1` HP floor, and every bout transitions into a restorative `heal` phase. Ladder enemies scale exclusively by ladder tier (`src/arena/arenaLadder.js`) rather than player level.

## Shared Bout Machine, Relay Phases, and UI Surfaces

- **Unified state machine (`src/arena/arenaBout.js`, `src/net/arenaBrain.js`):** Offline bouts (`src/arena/arenaBouts.js`) and online relay rooms (`src/arena/arenaOnline.js` and `server/src/index.js`) advance through `ARENA_ST_PHASES` (`wait`, `call`, `walk`, `count`, `fight`, `end`, `verdict`, `heal`, `done`, and `void`) and settle via `ARENA_HOW` (`yield`, `fall`, `ringout`, `judges`, or `forfeit`). Online rooms require a relay meeting `ARENA_RELAY_MIN` (`relaySupportsArena()`).
- **Account persistence (`server-account/src/arena.js`):** Completed online ladder and rated PvP bouts settle through `/v1/arena/attempt`, `/v1/arena/claim`, `/v1/arena/team`, and `/v1/arena/board` across `arena_pve`, `arena_pvp`, `arena_members`, `arena_renown`, and `arena_attempts`.
- **Gate scene and UI (`src/arena/arenaGate.js`, `src/ui/arenaWindow.js`, `src/ui/arenaHud.js`):** Players enter through the undercroft gate staffed by `ARENA_GATE_PEOPLE`, manage rosters and boards in `arenaWindow.js` (`ARENA_WINDOW_CSS`), and track live match state in `arenaHud.js` using copy from `ARENA_TEXT` (`src/arena/arenaText.js`).
