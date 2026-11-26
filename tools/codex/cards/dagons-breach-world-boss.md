---
slug: dagons-breach-world-boss
title: "Dagon's Breach World Boss Overview"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/gateLaw.js
  - src/net/gateBrain.js
  - src/net/gateCourts.js
  - src/net/gateReceipt.js
  - src/net/wire.js
  - src/worldEvents/gateCourt.js
  - src/world/gateArena.js
  - server/src/index.js
  - server-account/src/index.js
  - src/audio/deadlandsAir.js
  - src/render/deadlands.js
  - src/world/deadlandsLand.js
routes:
  - "/v1/gate/claim"
tables:
  - gate_kills
replacesBible:
  - "11-Multiplayer/World-Bosses.md"
related:
  - breach-schedule-site-and-omens
  - breach-boss-brain-and-courts
  - breach-receipts-spoils-and-embers
  - breach-rite-broker-and-multi-court
invariants:
  - "Option B trust: the relay Durable Object owns boss HP, attack scheduling, and signed kill receipts (`r1`), while clients judge only their own positional footing."
  - "Schedule, exterior site selection, omen rings, and daily marks derive deterministically from wall time and local map archives with zero relay traffic."
  - "The arena reuses the dungeon host (`buildDungeonContext`) with a generated block, disabling rest, recall, automap, fast travel, saves, and companions."
  - "Thunder in the Burning Court (`src/audio/deadlandsAir.js`) is timed from `flashOfSlot` in `src/render/deadlands.js` and delayed by distance at `SPEED_OF_SOUND`, so each strike and its thunder match. A gap between frames longer than `AIR_BACKLOG_S` (`2` s) plays none of the events it skipped."
  - "The Deadlands islands and shards are seeded from `LAND_SEED` and read `SIGIL_TOWER` and `DEAD_CLOCK_PERIOD` from `src/render/deadlands.js`, so every client draws the same land."
  - "A busy refusal from the court door counts as a word from the court for `COURT_DOOR_WAIT_MS` after stepping in, and a frame gap over `COURT_FRAME_GAP_MS` counts no silence."
traps:
  - "The player-facing feature name is `Dagon's Breach`, whereas code modules, room frames (`gate`), and storage keys retain `gate*` identifiers."
  - "Protocol compatibility gates on `GATE_BRAIN_V` and `GATE_BRAIN_MIN` (plus `COURT_WATCH_RELAY_MIN`), never on a hardcoded relay version string."
tags:
  - world-bosses
  - dagons-breach
  - multiplayer
  - relay
  - events
---

Dagon's Breach is an online world-boss event occurring once every in-game day (`GATE_EVERY_DAYS` = 1, or two real hours at TimeScale 12) where players enter a shared Deadlands court to fight Valkynaz Ruhn, Warden of the Burning Gate (`GATE_BOSSES` in `src/net/gateLaw.js`).

## Deterministic Schedule and Relay Authority

Every client calculates the daily schedule, exterior gate placement, omen ring, and active modifiers (`gateModsOf`) locally from wall time and map data without querying the relay. Once the gate opens or players finish the Faithful's Rite, fighters step into an instanced arena (`src/world/gateArena.js`, `src/worldEvents/gateCourt.js`) hosted on `buildDungeonContext`.

Inside the court (`src/net/gateBrain.js`), the relay Durable Object (`server/src/index.js`) enforces Option B authority over boss health, phase transitions across `COURTS_HIS` (3) courts at `PHASE_AT` (`[0.66, 0.33]`), and telegraph timing over the `gate` WebSocket room frame (`src/net/wire.js`). Clients evaluate whether their own feet avoid ground telegraphs.

## Receipts and Account Claims

When Valkynaz Ruhn falls (or a player completes the exterior rite), the relay signs an `r1` (`RECEIPT_V`) receipt valid for 7 days (`src/net/gateReceipt.js`) with earned status `dealt`, `stood`, or `rite`. Clients redeem receipts at `POST /v1/gate/claim` (`server-account/src/index.js`) to record rows in `gate_kills`, collect spoils, and earn Deadlands Embers.

## Subcards

- `breach-schedule-site-and-omens`: daily minute thresholds, region shuffle bag, terrain clearance, and the 144-gate modifier cycle.
- `breach-boss-brain-and-courts`: HP scaling, damage buckets, court crossings, Reckoning crystals, and Legion-Lord adds.
- `breach-receipts-spoils-and-embers`: receipt thresholds, `gate_kills` claims, spoils rolls, and Ember insignia unlocks.
- `breach-rite-broker-and-multi-court`: Faithful's Rite, Sigil Broker, multi-court seating, crowd tiers, and Discord Herald threads.
