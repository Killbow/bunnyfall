---
slug: online-coop-shared-dungeon-and-interior-rooms
title: "Shared Dungeon and Interior Rooms: Memory, Seat, Respawn, and Loot"
domain: multiplayer
kind: subcard
parent: online-coop-overview
files:
  - src/net/wire.js
  - src/net/onlineWorld.js
  - src/net/instanceRoom.js
  - src/scenes/dungeonContext.js
  - src/scenes/interiorContext.js
  - src/world/dungeonRespawn.js
  - src/world/smallerDungeons.js
  - src/items/roomLoot.js
  - src/items/roomLootHost.js
  - src/items/claimLedger.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Arc.md"
related:
  - online-coop-overview
  - online-coop-cell-enemies-halo-and-hits
  - world-modes-and-transitions
  - economy-ledger-and-item-judge
invariants:
  - "World rooms (dungeon:m<mapId>, interior:m<mapId>.<buildingKey>) persist chunked memory for WORLD_TTL_MS (30 days) after the room drains."
  - "useSmallerDungeon returns false online, so every client generates an identical dungeon layout."
  - "Only layout enemies stream. Quest spawns, summons, and dropped piles stay local to their owner."
  - "When the seat's enemy stream goes silent past FOES_STALE_MS (3 * FOES_FULL_MS), joiners fall back to local simulation, and the relay moves the seat to an active socket."
  - "Each shared container is judged by one authority through take logs (judgeRoomClaim), never by whole-list overwrites. A losing or timed-out claim returns the item to the container view."
traps:
  - "Owned houses and ships never mint a shared interior room (buildingKey 0), which keeps their storage per-player."
  - "Apply stored room loot only after asynchronous enemy retyping completes, or level-mismatched corpses duplicate gold."
dfu: []
tags:
  - dungeon
  - interior
  - room-memory
  - respawn
  - loot-arbitration
---

# Shared Dungeon and Interior Rooms: Memory, Seat, Respawn, and Loot

Shared dungeon (`dungeon:m<mapId>`) and interior (`interior:m<mapId>.<buildingKey>`) instances synchronize world changes, layout enemies, and container claims across co-op peers (`src/net/onlineWorld.js`, `src/net/instanceRoom.js`, `src/scenes/dungeonContext.js`, `src/scenes/interiorContext.js`).

## Room Memory, Layout Parity, and Host Seat

- **Layout parity (`src/world/smallerDungeons.js`):** `useSmallerDungeon` returns `false` online so every peer generates identical dungeon geometry. Owned homes and ships use `buildingKey` `0` and never open shared interior rooms.
- **Chunked memory (`src/net/wire.js`):** Durable Objects retain room state for `WORLD_TTL_MS` (`30` days) after draining. Snapshots respect `WORLD_FRAME_MAX` (`512 KiB`), `WORLD_FRAME_MAX_INTERIOR` (`64 KiB`), and `WORLD_MIN_MS` (`5000` ms).
- **Enemy seat and failover (`src/net/wire.js`):** Only layout enemies stream across `FOES_FRAME_MAX` (`64 KiB`), while quest spawns, summons, and dropped piles stay local. If the active seat goes silent past `FOES_STALE_MS` (`3 * FOES_FULL_MS`), peers fall back to local simulation and the relay reassigns the seat.

## Respawn Timers and Container Loot Arbitration

- **Respawn sweeps (`src/world/dungeonRespawn.js`, `src/net/wire.js`, `src/scenes/dungeonContext.js`):** `respawnDue(stampMs, nowMs)` checks relay wall time against death stamps using `DUNGEON_RESPAWN_MS` (`20` min), `ELITE_DUNGEON_RESPAWN_MS` (`40` min), or wild and super-tier `RESPAWN_MS` (`30` min). Sweeps rebuild at most `RESPAWN_BURST` (`4`) spawns per tick.
- **Claim arbitration (`src/items/roomLoot.js`, `src/items/roomLootHost.js`, `src/items/claimLedger.js`):** Shared containers (`LOOT_LIST_MAX = 64`, `LOOT_STACK_MAX = 65535` in `src/items/loot.js`) settle takes through `judgeRoomClaim` logs after async enemy retyping finishes; rejected or expired claims restore the item locally.
