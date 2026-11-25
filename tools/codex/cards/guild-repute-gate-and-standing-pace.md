---
slug: guild-repute-gate-and-standing-pace
title: "Online Guild Quest Repute Gate and Owed Standing Pace"
domain: guilds
kind: subcard
parent: guild-seat-line-and-standing-words-overview
files:
  - src/systems/quest/onlineRepute.js
  - src/systems/quest/offerFlow.js
  - src/justice/standingOwed.js
  - src/net/npcRollTracker.js
  - src/net/npcChapterLaw.js
  - src/guilds/factionRep.js
  - src/guilds/rollNoticeHost.js
  - server-account/src/npcRoll.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-15g.md"
related:
  - guild-seat-line-and-standing-words-overview
  - chapters-roll-reputation-and-customs
  - chapters-roll-claim-atomicity-and-replay
invariants:
  - "Online, a guild quest is offered only once standing meets its header Repute requirement (onlineRepute.js, checked by offerFlow.js)."
  - "Owed standing clears only when the Roll ends, never when the page merely hides."
traps:
  - "QSCRIPT-FREE (waiving quest penalties) was withdrawn; theft and murder penalties still apply."
  - "readRoll and claimRoll are implemented in server-account; the client only reads their paid map."
dfu: []
tags:
  - repute-gate
  - standing
  - owed
  - roll-pace
---

# Online Guild Quest Repute Gate and Owed Standing Pace

Online guild quest reputation gating and pending standing synchronization span `src/systems/quest/onlineRepute.js`, `src/systems/quest/offerFlow.js`, `src/justice/standingOwed.js`, `src/net/npcRollTracker.js`, and `server-account/src/npcRoll.js`.

## Online Quest Repute Gate

- **Header reputation checks:** When running online, `src/systems/quest/offerFlow.js` consults `src/systems/quest/onlineRepute.js` before presenting a guild quest (such as Mages Guild questor table `MG_Quests`, id `63`), offering the assignment only after player standing meets the quest header Repute threshold.
- **Faction propagation and penalties:** Reputation deltas propagate across related factions through `propagateReputationChange` in `src/guilds/factionRep.js`. Standard quest-script reputation penalties, including theft and murder deductions, remain active online and are never waived.

## Owed Standing and Roll Lifecycle

On the account server, `readRoll` and `claimRoll` (`server-account/src/npcRoll.js`, governed by constants in `src/net/npcChapterLaw.js`) settle paced reputation claims and return the paid standing map. The client reads that paid map in `src/net/npcRollTracker.js` and forwards `rollMovesOf` deltas to `onStanding` (`src/guilds/rollNoticeHost.js`). Pending owed standing tracked in `src/justice/standingOwed.js` clears only when the Roll session ends, never when the browser page merely hides.
