---
slug: guild-seat-line-and-standing-words-overview
title: "Guild Seat Line, Rank Needs, and Standing Words"
domain: guilds
kind: overview
parent: null
files:
  - src/guilds/guilds.js
  - src/guilds/guildServiceFlow.js
  - src/net/npcChapterLaw.js
  - src/scenes/worldModes.js
  - src/guilds/rollNoticeHost.js
  - src/net/onlineWorld.js
  - src/guilds/guildFactions.js
  - src/guilds/knightlyGifts.js
  - src/guilds/guildServices.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-15g.md"
related:
  - guild-repute-gate-and-standing-pace
  - chapters-arc-overview
  - chapters-contested-seats-and-titles
  - chapters-hall-writs-receipts-and-merit
  - guilds-made-plain-overview
  - plain-words-board-seat-and-chapter-guides
invariants:
  - "Online while the Roll holds, review promotes no higher than ctx.rankCeiling; ranks 8 and 9 are chapter seats won by Merit."
  - "Offline (DFU rules) the ceiling is null and every rank stays reachable by review."
  - "ROLL_SEAT_LINE = RANK_REQ_REPUTATION[8] (80)."
  - "seatEligibleAt requires SEAT_TENURE_S (14 real days) of guild tenure and SEAT_ACCOUNT_AGE_S (7 real days) of account age; chairs go to the most Merit over SEAT_MERIT_WEEKS (4)."
  - "A seat holder in the hall of their own chapter is read through seatedBook and is asked for nothing more."
traps:
  - "openGuildService and openServiceFlow are wired only in src/scenes/worldModes.js."
  - "rollNoticeHost.js is wired from src/net/onlineWorld.js, not from world.js."
  - "Seats carry no skill requirements; do not show the DFU rank-8 skills."
  - "The SEAT-LINE text appears only in the enhanced skin; the classic window draws nothing new."
dfu: []
tags:
  - guild
  - seat-line
  - seat-words
  - standing-words
  - repute-gate
  - roll
  - rankNeeds
  - rollBookCap
---

# Guild Seat Line, Rank Needs, and Standing Words

Online guild rank ceilings, chapter seat prompts, and standing review messages are governed by `src/guilds/guilds.js`, `src/guilds/guildServiceFlow.js`, `src/net/npcChapterLaw.js`, and `src/guilds/rollNoticeHost.js` (wired from `src/net/onlineWorld.js`, while `openGuildService` and `openServiceFlow` run through `src/scenes/worldModes.js`).

## Seat Ceilings and Rank Requirements

- **Roll ceiling and eligibility:** Online while the Roll holds, review promotes no higher than `ctx.rankCeiling` (with `rollBookCap` capping guild books during adoption), reserving ranks 8 and 9 above `ROLL_SEAT_LINE` (`RANK_REQ_REPUTATION[8]`, 80) as chapter seats won by Merit. Offline, the ceiling is `null` and every rank is reachable by review. `seatEligibleAt` requires `SEAT_TENURE_S` (14 real days) of guild tenure and `SEAT_ACCOUNT_AGE_S` (7 real days) of account age, awarding chairs to the top Merit earners over `SEAT_MERIT_WEEKS` (4).
- **Seat and standing wording:** In the enhanced skin, `rankNeeds` uses `guild.rankNeeds.seat` and `guild.rankNeeds.seatMerit` (`src/guilds/guildServiceFlow.js`) to describe the next rank at the ceiling as a seat without displaying rank-8 skill thresholds. `serviceAccess` (alongside `magesCanAccessService` in `src/guilds/guildServices.js`) and `receiveHouseDecision` (`src/guilds/knightlyGifts.js`) explain chair ranks as seats, while a seat holder in their own chapter hall reads through `seatedBook`. `reviewWarnings` and `reviewDaysLeft` report review timers and owed standing.
