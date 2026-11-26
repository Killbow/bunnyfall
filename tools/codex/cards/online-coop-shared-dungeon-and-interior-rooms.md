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
  - src/items/bodyLootHost.js
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
  - "An enemy body is identified by its owner, its body number, and its generation (`bg`). Each body loot host seeds its generation counter from the CSPRNG, and a new claim is judged only when the asker is in reach and names the generation of that body."
  - "A claim with no verdict is re-sent with the same id, backing off up to `CLAIM_RESEND_MAX_MS`, until it is answered or `CLAIM_KEEP_MS` passes. The owner answers an id it already judged from its verdict ledger, so a lost verdict is recovered and never judged twice."
  - "A claim id is `<peer>:<stamp>:<count>` (`roomClaimId`), and `claimOf` accepts only an id that starts with the peer id of the sender, so `landRoomWord` drops any claim or put that a peer sends in the name of another peer."
  - "`bonusShare` returns `(own - base) / (1 - base)`, capped at 1, when the player chance is above the base chance and the base chance is below 1, and 0 otherwise, so the base roll and the bonus roll together give the player their own chance."
  - "`composeRoomView` puts the base piece objects themselves into the list and sets their `stackCount` in place, so a take holds the same object that the base holds on every later compose."
  - "Spent bonus places are saved in the character mod save data under `RoomLootBonus`, keyed by `<container name>|<character>` and capped at `ROOM_BONUS_KEPT` (2048) with the oldest dropped, so a reload or a return rolls no bonus again."
  - "`roomClaimOrder` sorts claims by relay time (`tm`), then by id. `roomTakeSeat` judges the claims that the last host left unanswered in that order, so the result is the same whichever client takes the seat."
  - "`roomTermsBeat` decides which room terms win: a newer generation (`g`), then the earlier mint time (`tm`), then the lower level, then the lower fighter count (`n`), and only then the lower signature `h`, when both terms carry one."
  - "`seededRolls` seeds an sfc32 generator from a hash of the container name and warms it with 12 draws, so every client gets the same draws in the same order for the same name."
traps:
  - "Owned houses and ships never mint a shared interior room (buildingKey 0), which keeps their storage per-player."
  - "Apply stored room loot only after asynchronous enemy retyping completes, or level-mismatched corpses duplicate gold."
  - "`listMovesSince` matches pieces by object identity, never by row, because row 0 of a filtered window is not place 0. A window that splits a stack lowers the count of that piece, so a partial take reads as a drop in count."
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
