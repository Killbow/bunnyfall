---
slug: chapters-arc-overview
title: "Chapters Arc: Server-Held Guild Standing and Regional Chapters"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/npcChapterLaw.js
  - server-account/src/npcRoll.js
  - server-account/src/npcHalls.js
  - server-account/src/npcMerit.js
  - server-account/src/npcReceipts.js
  - server-account/src/npcChapters.js
  - server-account/src/routes/townRoutes.js
  - src/net/chapterSheet.js
routes:
  - /v1/chapters/roll
  - /v1/chapters/claim
  - /v1/chapters/witness
  - /v1/chapters/halls
  - /v1/chapters/strike
  - /v1/chapters/list
  - /v1/chapters/focus
  - /v1/chapters/history
  - /v1/chapters/back
  - /v1/chapters/patron
tables:
  - npc_roll_heads
  - npc_roll
  - npc_chapters
  - npc_chapter_weeks
  - npc_chapter_merit
  - npc_chapter_seats
replacesBible:
  - "11-Multiplayer/Chapters-Arc.md"
related:
  - chapters-roll-reputation-and-customs
  - chapters-hall-writs-receipts-and-merit
  - chapters-contested-seats-and-titles
  - chapters-patronage-and-living-world
  - npc-chapter-bands-events-and-duties
  - guilds-made-plain-overview
invariants:
  - "Offline play keeps DFU's guild rules 1:1. The Roll applies only to online realm characters while the `CHAPTERS_OPEN` switch (`CHAPTERS_SWITCH` = off/dev/on, `chaptersSwitchOf`) is not 'off'."
  - "A chapter is one (guild faction, region) pair (`npc_chapters` primary key faction+region), derived from confirmed town-hall reports (`npc_hall_regions`)."
  - "All /v1/chapters/* routes are session-authenticated, use primary consistency, and are mounted in `server-account/src/routes/townRoutes.js`."
  - "Weekly settlement runs `CHAPTER_TURNING_GRACE_S` (300 s) after the seat-week boundary and is keyed by week on `npc_chapter_weeks`, so a week settles once."
traps:
  - "The first week ever settled 'on' after 'dev' weeks resets every chapter's Strength, seats, and patronage. Later dev/on cycles do not reset anything (AUDIT CHAP5 S6)."
  - "Comments in `npcChapterLaw.js` that say 'twenty-two' are stale: `ROLL_FACTIONS` also includes `BUNNY_FACTIONS`."
dfu: []
tags:
  - chapters
  - roll
  - guilds
  - multiplayer
  - overview
---

# Chapters Arc: Server-Held Guild Standing and Regional Chapters

The Chapters subsystem layers server-authoritative guild standing and regional NPC chapter politics over online realm play while leaving offline Daggerfall Unity guild rules untouched. Shared constants live in `src/net/npcChapterLaw.js`, client chapter state snapshots pass through `createChapterSheet` (`src/net/chapterSheet.js`, queried via `chapterSheet.chapterOf(faction, region)`), and all ten `/v1/chapters/*` endpoints mount in `server-account/src/routes/townRoutes.js` with session authentication and primary D1 consistency.

## End-to-End Pipeline and Switch Rules

- **Feature switch (`CHAPTERS_OPEN`):** Validated by `chaptersSwitchOf` against `CHAPTERS_SWITCH` (`'off'`, `'dev'`, `'on'`). The Roll and chapter routes operate only when the switch is not `'off'`. On the very first week ever settled as `'on'` following `'dev'` weeks, settlement resets all chapter Strength, seats, and patronage; subsequent `'on'` to `'dev'` to `'on'` transitions do not reset state.
- **Data flow:** Character guild reputation lives on the Roll (`npc_roll_heads`, `npc_roll` in `server-account/src/npcRoll.js`), covering standard guilds, divines, orders, and `BUNNY_FACTIONS`. Confirmed town-hall reports (`server-account/src/npcHalls.js`) establish regional chapters (`npc_chapters`, keyed by faction and region).
- **Weekly settlement:** Hall writs, member writs, and service receipts (`server-account/src/npcReceipts.js`) feed weekly Merit (`npc_chapter_merit` in `server-account/src/npcMerit.js`). At `CHAPTER_TURNING_GRACE_S` (`300` s) past the seat-week boundary, `server-account/src/npcChapters.js` settles `npc_chapter_weeks` once, updating Strength bands, contested seats (`npc_chapter_seats`), seasonal events (`npc-chapter-bands-events-and-duties`), and Company patronage.
