---
slug: bounty-hunt-packs-trails-and-party
title: "Hunt Packs, Two-Group Trails, Farms, and Party Sync"
domain: systems
kind: subcard
parent: bounty-boards-overview
files:
  - src/guilds/bountyHost.js
  - src/guilds/bountyBoard.js
  - src/guilds/bountyFarms.js
  - src/guilds/bountyJournal.js
  - src/characters/foesWorld.js
  - src/net/wire.js
  - src/world/worldSaveLoad.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Bounty-Boards.md"
related:
  - bounty-boards-overview
  - bounty-board-postings-tiers-and-purses
  - online-coop-party-quest-trade-and-ally-cast
invariants:
  - "Packs of BOUNTY_SPLIT_MIN (6) or more in the open split into two groups. The second group waits at a trail spot within BOUNTY_GROUP_REACH_M (150 m). Dungeon packs never split."
  - "A pack re-stands with only the beasts still remaining. An enemy culled by walking 200 m away leaves no corpse and is not counted as a kill."
  - "`bountyPackOwner`: an owner of an existing standing pack keeps it. Otherwise the lowest account id among live online mates on the same pixel and inside flag stands it."
  - "`bountyPartyKills` takes the maximum kill count across holders. `bountyClearPays` pays only mates who took the bounty before the clear's timestamp."
traps:
  - "Party poses carry bounty rows validated by `validPartyPose` and `BOUNTY_POSE_ID_RE` in src/net/wire.js, which keeps its own copy of the id law. Change both places together."
dfu: []
tags:
  - bounty
  - party
  - pack
  - farm
  - trail
---

# Hunt Packs, Two-Group Trails, Farms, and Party Sync

`src/guilds/bountyHost.js`, `src/guilds/bountyFarms.js`, and `src/characters/foesWorld.js` manage how active bounty packs spawn in the world, split across two-stage trails, build temporary farmsteads, and synchronize kills across a co-op party.

## Two-Group Trails, Farms, and Pack Re-Standing

- Open-ground packs of at least `BOUNTY_SPLIT_MIN` (`6`) enemies split into two groups (`src/guilds/bountyBoard.js`); clearing the first reveals a trail to the second within `BOUNTY_GROUP_REACH_M` (`150` m). Dungeon packs never split.
- Farm-themed contracts (`FARM_STORY_RE` in `src/guilds/bountyFarms.js`) place a temporary farmstead using up to `FARM_SPOT_TRIES` (`16`) placement attempts; the farm persists until the hunter moves `FARM_LINGER_M` (`200` m) away and rebuilds across saves (`src/world/worldSaveLoad.js`). Camp encounters spawn through `_standCampEncounter` (`src/characters/foesWorld.js`).
- If a pack is culled by walking `200` m away or reloaded, it re-stands with only the surviving enemies. Culled enemies leave no corpse and never increment kill counts.

## Quest Log and Co-op Party Synchronization

- Taken contracts appear in the quest log under `BOUNTY_QUEST_PREFIX` (`src/guilds/bountyJournal.js`) and can be dropped with `abandonBountyQuest`. When a contract finishes, the payday notice queues behind open UI windows so it is never lost.
- In co-op parties, `validPartyPose` and `BOUNTY_POSE_ID_RE` (`src/net/wire.js`) validate shared bounty progress rows.
- `bountyPackOwner` keeps an existing pack owner or assigns the lowest account id among live mates sharing the map pixel and interior state. `bountyPartyKills` takes the highest kill count among holders, and `bountyClearPays` pays only mates who accepted the contract before the clear timestamp.
