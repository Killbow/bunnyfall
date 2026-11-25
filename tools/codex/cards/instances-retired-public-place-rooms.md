---
slug: instances-retired-public-place-rooms
title: "Public Place Rooms and Retired Quest Instances"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/instanceRoom.js
  - src/net/online.js
  - src/net/wire.js
  - src/scenes/worldModes.js
  - src/world/outsideViewWorld.js
  - src/scenes/dungeonContext.js
  - src/world/smallerDungeons.js
  - src/systems/quest/questRepair.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Instances.md"
related:
  - instance-owner-digest-and-party-kin-door
  - legacy-instance-words-in-saves-anchors-and-staff
  - online-coop-shared-dungeon-and-interior-rooms
  - dungeon-sizing-and-online-quest-relay
  - world-modes-and-transitions
  - room-engine-and-hub-sharding
invariants:
  - "ONLINE-PUBLIC: `roomKeyFor` (src/net/online.js) mints only `dungeon:m<id>` plus the size tag `.m`/`.s` (`dungeonRoomTag`) or `interior:m<id>.<key>`; no owner/epoch suffix."
  - "`WORLD_ROOM` in src/net/wire.js admits only public dungeon and interior keys; an `.i<owner>.<epoch>` key is not a world room."
  - "`worldTtlMsFor()` returns `WORLD_TTL_MS` (30 days) for every world room; there is no shorter instance TTL."
  - "worldModes `enterDungeonDoor` and `enterBuildingDoor` call `tryEnterDungeon` / `enterInteriorCore` directly; no door popup is shown."
  - "Quest people, items and enemies mount in the public room as private stands for the quest holder only (dungeonContext.js), after `relayBuiltDungeon` (QUEST-VOID) re-lays unreachable markers."
  - "Privateer Hold is an ordinary public dungeon online; `HOLD-ONCE` is retired."
traps:
  - "Do not reintroduce per-quest rooms by composing `instanceRoomOf` into `roomKeyFor`; the relay `WORLD_ROOM` regex would reject the key and no memory or enemy stream would exist."
  - "Comments in src/net/wire.js and src/net/online.js still cite `scenes/instanceDoor.js` and `_instanceHello`; those no longer exist."
dfu: []
tags:
  - instances
  - online-public
  - rooms
  - retired
  - dungeon
  - interior
---

# Public Place Rooms and Retired Quest Instances

Owner-epoch instance rooms, door popups, and per-quest room admission were superseded by `ONLINE-PUBLIC` (`src/net/online.js`, `src/net/wire.js`, `src/scenes/worldModes.js`). Every online dungeon or building entry opens a shared public room with local quest entities (`online-coop-shared-dungeon-and-interior-rooms`, `dungeon-sizing-and-online-quest-relay`).

## Public Room Keys and Door Entry

- **Public room minting (`src/net/online.js`, `src/net/wire.js`, `src/world/outsideViewWorld.js`):** `roomKeyFor` mints only `dungeon:m<id>` with the `.m` or `.s` size tag (`dungeonRoomTag`) and `interior:m<id>.<key>`. `WORLD_ROOM` rejects `.i<owner>.<epoch>` suffixes, and `worldTtlMsFor()` returns `WORLD_TTL_MS` (`30` days).
- **Direct door transitions (`src/scenes/worldModes.js`, `src/net/instanceRoom.js`):** `enterDungeonDoor` and `enterBuildingDoor` call `tryEnterDungeon` and `enterInteriorCore` directly without any popup. Privateer Hold is a public dungeon online, retiring `HOLD-ONCE`.
- **Private quest stands (`src/scenes/dungeonContext.js`, `src/world/smallerDungeons.js`, `src/systems/quest/questRepair.js`):** Online quests carry the `ONLINE_DUNGEONS_STATE` (`4`) stamp. After `relayBuiltDungeon` (`QUEST-VOID`) re-lays unreachable markers, quest people, items, and enemies mount as private stands for the quest holder.

## Surviving Subsystems

- **Owner digest and kin door (`instance-owner-digest-and-party-kin-door`):** `instanceOwnerOf` and `/internal/instance/kin` remain active for Sky-Ketch boarding.
- **Legacy layout words (`legacy-instance-words-in-saves-anchors-and-staff`):** Recorded `whole` and `ins` flags still select full public geometry for older saves, anchors, and staff landings.
