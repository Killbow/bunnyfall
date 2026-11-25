---
slug: online-coop-party-quest-trade-and-ally-cast
title: "Party Play: Quest Sharing, Player Trade, Ally Casts, Rest Sync, and Travel"
domain: multiplayer
kind: subcard
parent: online-coop-overview
files:
  - src/systems/quest/questShare.js
  - src/net/tradeSession.js
  - src/magic/allyCast.js
  - src/party/partyWorld.js
  - src/party/partyTravel.js
  - src/party/partyTravelLaw.js
  - src/travel/horseCartWorld.js
  - src/travel/horseCartWire.js
  - server/src/message/frames/quest.js
  - server/src/message/frames/trade.js
  - server/src/message/frames/cast.js
  - server/src/message/frames/park.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Arc.md"
related:
  - online-coop-overview
  - online-time-quest-delays-and-deadlines
  - magic-bundles-and-reflection-quirks
  - items-gold-counter-and-wagon
invariants:
  - "Quests stay per-player. receiveSharedQuest checks that questName matches, refuses main quests, and dry-runs on a scratch Quest before it mutates live state."
  - "Trade commits only after the local item reservation succeeds. Offer edits are refused once myConfirm is set, and unsent reservations come back on cancel."
  - "Ally casts admit only ALLY_CAST_TYPES and apply as self-cast rangeType 0. Stranger gifts require acceptStrangerSpells, and every effect must be in STRANGER_CAST_TYPES."
  - "Parked horse-cart records key on account subject and character id, never peer id, and expire after PARK_TTL_MS (72 h)."
  - "Party travel refuses indoors and deduplicates settlement offers over LEADER_SETTLE_MS (5000 ms)."
traps:
  - "If a trade frame never left the socket, its goods must return to the sender (the LOOT-DUP law in src/net/hitPend.js)."
  - "Duplicate effect types in one gift cast stacked buff pools until findInc began ignoring tags within the same cast."
dfu: []
tags:
  - party
  - quests
  - trade
  - ally-cast
  - rest
  - travel
---

# Party Play: Quest Sharing, Player Trade, Ally Casts, Rest Sync, and Travel

Co-op parties coordinate quest envelopes, direct trades, beneficial spell casts, rest gates, and fast travel through relay room frames under `server/src/message/frames/`.

## Quest Sharing, Player Trade, and Ally Casts

- **Quest sharing (`src/systems/quest/questShare.js`, `server/src/message/frames/quest.js`):** Quests stay per-player. `receiveSharedQuest` verifies `questName`, rejects main quests, and dry-runs on a scratch `Quest` instance before mutating live state.
- **Player trade (`src/net/tradeSession.js`, `server/src/message/frames/trade.js`):** Peers within `TRADE_RANGE_M` (`5` meters) reserve offered items locally before committing. Setting `myConfirm` locks the offer, and any canceled or unsent trade frame returns reserved goods to the sender (`LOOT-DUP` law in `src/net/hitPend.js`).
- **Ally and stranger casts (`src/magic/allyCast.js`, `server/src/message/frames/cast.js`):** Friendly spells arm within `ALLY_ARM_RADIUS` (`10`), admit only `ALLY_CAST_TYPES`, and apply locally as self-cast `rangeType` `0` while `findInc` ignores duplicate effect tags within one cast. Stranger gifts require `acceptStrangerSpells` and restrict effects to `STRANGER_CAST_TYPES` (`{3, 8, 9, 10, 18, 20, 27, 30, 35}`).

## Rest Synchronization, Travel, and Parked Carts

- **Party rest and travel (`src/party/partyWorld.js`, `src/party/partyTravel.js`, `src/party/partyTravelLaw.js`):** `partyRestGate` coordinates group rest up to `PARTY_REST_HOURS_MAX` (`99` in `src/net/wire.js`). Party travel refuses indoor origins and deduplicates leader offers across `LEADER_SETTLE_MS` (`5000` ms).
- **Parked mounts (`src/travel/horseCartWorld.js`, `src/travel/horseCartWire.js`, `server/src/message/frames/park.js`):** Parked horse-and-cart records key on account subject and character id (never `peerId`) and expire after `PARK_TTL_MS` (`72` h).
