---
slug: chapters-patronage-and-living-world
title: "Chapter Patronage Escrow, Banners, and Living-World Guild Days"
domain: multiplayer
kind: subcard
parent: chapters-arc-overview
files:
  - src/net/npcChapterLaw.js
  - server-account/src/npcChapters.js
  - server-account/src/guilds.js
  - src/guilds/chapterBanners.js
  - src/net/chapterEvents.js
  - src/systems/livingWorld/dayPlan.js
  - src/systems/livingWorld/lines.js
routes:
  - /v1/chapters/patron
  - /v1/chapters/back
  - /v1/chapters/list
tables:
  - npc_chapter_patron_bids
  - npc_chapters
  - npc_chapter_backing
replacesBible:
  - "11-Multiplayer/Chapters-Arc.md"
related:
  - chapters-arc-overview
  - npc-chapter-bands-events-and-duties
  - guild-disband-holds-and-refusals
  - guild-heraldry-divisions-and-charges
  - living-world-census-schedules-and-watch
invariants:
  - "`patronBidOk`: a whole number >= `CHAPTER_PATRON_MIN` (1000 Marks), higher than the guild's standing bid, and <= `MARKS_MAX`. It is held in ledger escrow under `patronEscrowId` `patron:<season>:<titleKey>:<guild>`."
  - "`patronWinnerOf`: the highest bid wins (on a tie, the earliest to reach that amount, then the lower guild id) and its escrow is burnt. Every other bid is refunded. A patron gets no influence over seats."
  - "A guild with an open bid cannot disband: the `server-account/src/guilds.js` 'guild-patron' refusal checks `npc_chapter_patron_bids` for state 'open'."
  - "Hidden-guild chapters cannot take a patron."
traps:
  - "`CHAPTER_PATRON_RAISES` = [500, 1000, 5000] are the UI's raise steps. They are not the minimum bid."
  - "`hallGuildDays` gives a hall `GUILD_DAYS_BY_BAND` evenings (failing 1, steady 2, thriving/ascendant 3) from `GUILD_DAY_OFFSETS` [0,3,5]. A shut hall gets `GUILD_DAYS_SHUT` (0)."
  - "Schism and succession backing (`npc_chapter_backing`, one row per account per chapter per season) goes through /v1/chapters/back, and `chapterBackOk` limits the side index."
dfu: []
tags:
  - patronage
  - escrow
  - banners
  - living-world
---

# Chapter Patronage Escrow, Banners, and Living-World Guild Days

Player Companies can sponsor visible NPC chapters for a season, hanging their heraldry at the hall and receiving Thriving-band service pricing while chapter Strength drives town schedules and rumors.

## Seasonal Patronage Bidding and Escrow

- **Escrow rules (`/v1/chapters/patron`, `npc_chapter_patron_bids`):** `patronBidOk` (`src/net/npcChapterLaw.js`) requires a whole-number bid of at least `CHAPTER_PATRON_MIN` (`1000` in the `marks` ledger currency, displayed via `marksText` as `'Imperial Argents'`), above the Company's standing bid, and at most `MARKS_MAX` (`CHAPTER_PATRON_RAISES` of `[500, 1000, 5000]` are only UI raise steps). Hidden-guild chapters cannot take a patron. Bids lock in ledger escrow under `patronEscrowId` (`patron:<season>:<titleKey>:<guild>`). An `'open'` bid blocks Company disbanding in `server-account/src/guilds.js` with `'guild-patron'`.
- **Settlement and benefits:** At seasonal settlement (`server-account/src/npcChapters.js`), `patronWinnerOf` picks the highest bid (breaking ties by earliest timestamp at that amount, then lower guild id), burns the winning escrow, and refunds all other bids. A patron gains no influence over seats, displays Company arms via `src/guilds/chapterBanners.js`, and pays at most `CHAPTER_PATRON_BAND` (`'thriving'`, `CHAPTER_PATRON_PRICE`).
- **Event backing (`/v1/chapters/back`):** During Schism or Succession seasons (`src/net/chapterEvents.js`), accounts record one `npc_chapter_backing` row per chapter per season, checked by `chapterBackOk`.

## Living-World Guild Evenings and Rumors

In `src/systems/livingWorld/dayPlan.js`, `hallGuildDays` assigns `GUILD_DAYS_BY_BAND` hall evenings per week (`1` Failing, `2` Steady, `3` Thriving or Ascendant, or `GUILD_DAYS_SHUT = 0` when shut) from `GUILD_DAY_OFFSETS` (`[0, 3, 5]`). Town lines (`src/systems/livingWorld/lines.js`) repeat chapter band and event rumors for `CHAPTER_NEWS_DAYS` (`2`) days.
