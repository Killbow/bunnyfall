---
slug: guilds-made-plain-overview
title: "Guilds Made Plain: One Word Per Concept, Every Rule Before the Press"
domain: multiplayer
kind: overview
parent: null
files:
  - src/net/npcChapterLaw.js
  - src/net/guildPowers.js
  - src/ui/socialPanel.js
  - src/ui/noticeWindow.js
  - src/ui/playerBadge.js
  - server-account/src/guilds.js
  - server-account/src/npcChapters.js
routes:
  - /v1/guilds/mine
  - /v1/guilds/disband
  - /v1/chapters/list
  - /v1/chapters/roll
tables:
  - guilds
  - npc_chapters
  - npc_chapter_seats
  - npc_chapter_history
replacesBible:
  - "11-Multiplayer/Guilds-Made-Plain.md"
  - "01-Overview/audits/Audit-Guild3.md"
related:
  - guild-disband-holds-and-refusals
  - guild-rank-acts-and-silver-ledger-lines
  - npc-chapter-bands-events-and-duties
  - guild-overhaul-overview
  - guild-window-and-member-presence
  - professions-board-and-writs
  - seats-arc-overview
invariants:
  - "Offline Daggerfall Unity guild mechanics remain untouched; all `GUILD3a`-`GUILD3e` rules apply strictly to online player guilds (Companies) and online NPC chapters."
  - "Player-facing terminology changes never alter wire payload keys, refusal error codes, or D1 table schemas, and no data migrates across tables."
  - "Every blocking condition or rank permission shown in the UI derives from the same table or query enforced by the account service (`GUILD_HOLDS` and the four power tables)."
traps:
  - "Character Merit in an NPC chapter and town seat influence are distinct currencies, just as personal guild standing and chapter Strength are distinct axes; never conflate or merge them."
  - "The item Vault (`guild_vault`) and profession material Stores (`guild_prof_stores`) remain separate Company window pages and separate D1 tables."
  - "Native Daggerfall Unity training and spell windows do not render itemized price breakdowns; chapter Strength band discounts and surcharges are explained on the town notice board instead."
dfu: []
tags:
  - guilds
  - chapters
  - ux
  - terminology
  - guild3
---

# Guilds Made Plain: One Word Per Concept, Every Rule Before the Press

The Guilds Made Plain pass (`GUILD3a` through `GUILD3e` across `src/net/npcChapterLaw.js`, `src/net/guildPowers.js`, `src/ui/socialPanel.js`, `src/ui/noticeWindow.js`, `src/ui/playerBadge.js`, `server-account/src/guilds.js`, and `server-account/src/npcChapters.js`) unifies player-facing vocabulary and exposes every refusal condition or rank rule in the UI before the player presses an action button. Service feature switches `CHAPTERS_OPEN`, `MARKS_OPEN`, and `SEATS_OPEN` (`off`, `dev`, or `on`) gate the online subsystems while keeping wire schemas intact.

## Core Design Pillars (`GUILD3a`-`GUILD3e`)

- **Distinct seat and rank titles (`GUILD3a`):** NPC chapter ranks `8` and `9` (`npc_chapter_seats`) display as `'a council chair'` (title `Councillor`) and `'the Master's chair'` (`SEAT_WORDS` and `CHAPTER_TITLE_WORDS` in `src/net/npcChapterLaw.js`), while the chapter Roll (`POST /v1/chapters/roll`) retains its name.
- **Derived rank acts and directional ledger lines (`GUILD3b`):** `src/net/guildPowers.js` composes rank capability sentences directly from the permission tables, and treasury ledger lines distinguish incoming from outgoing movements (`guild-rank-acts-and-silver-ledger-lines`).
- **Whole-list disband holds (`GUILD3c`):** `GUILD_HOLDS` in `server-account/src/guilds.js` drives both the Settings checklist (`GET /v1/guilds/mine`) and `POST /v1/guilds/disband` refusals (`guild-disband-holds-and-refusals`).
- **Two notice-board chapter cards (`GUILD3d`):** Town notice boards (`src/ui/noticeWindow.js`) condense chapter cards to two by folding hall receipt rules into the chapter's Duties line (`chapterDutiesLine`).
- **Four Strength bands and five season events (`GUILD3e`):** Chapter Decline and Ascendancy live inside the Failing and Ascendant Strength bands, leaving five weighted seasonal events in `npc_chapter_history` (`npc-chapter-bands-events-and-duties`).
