---
slug: chapters-contested-seats-and-titles
title: "Contested Master and Officer Seats, Focus, and Chapter Titles"
domain: multiplayer
kind: subcard
parent: chapters-arc-overview
files:
  - src/net/npcChapterLaw.js
  - server-account/src/npcChapters.js
  - src/net/identityToken.js
  - src/ui/hallOfRecords.js
routes:
  - /v1/chapters/focus
  - /v1/chapters/history
  - /v1/chapters/roll
tables:
  - npc_chapter_seats
  - npc_chapter_history
  - npc_chapter_merit
  - npc_roll
replacesBible:
  - "11-Multiplayer/Chapters-Arc.md"
related:
  - chapters-arc-overview
  - chapters-roll-reputation-and-customs
  - identity-tokens-and-relay-seam
  - npc-chapter-bands-events-and-duties
invariants:
  - "Each chapter has `CHAPTER_SEATS` = 1 master and 3 officers. `SEAT_RANK` gives master rank 9 and officer rank 8. A rank above `ROLL_BOOK_RANK_MAX` (7) comes only from a seat."
  - "`seatEligibleAt` requires membership, reputation >= `ROLL_SEAT_LINE` (rank 8's requirement), `SEAT_TENURE_S` (14 days) on the Roll, and an account at least `SEAT_ACCOUNT_AGE_S` (7 days) old."
  - "`chapterSeatPlan` ranks candidates by `seatScoreOf` over `SEAT_MERIT_WEEKS` (4) of Merit, with no incumbent multiplier. Being seated only breaks ties; after that come longer tenure and then the lower char id."
  - "Each account holds at most one seat per guild across all regions, and each character at most one Master seat. A seat with no Merit-earning candidate stays vacant."
traps:
  - "`seatedBook` raises the rank only at that seat's own chapter halls, and only for a book row DFU already holds at rank 7."
  - "A client re-asks the Roll about its seats after `ROLL_SEATS_MS` (10 min), the same interval as `SHEET_KEPT_MS`."
  - "The Chronicle (`npc_chapter_history`) returns `CHAPTER_CHRONICLE_ROWS` (60) rows. A roll name is at most `CHAPTER_ROLL_NAME_MAX` (32) characters."
dfu:
  - Guild.cs
tags:
  - seats
  - titles
  - focus
  - chronicle
---

# Contested Master and Officer Seats, Focus, and Chapter Titles

Ranks above `ROLL_BOOK_RANK_MAX` (`7`) come only from contested regional chapter seats (`npc_chapter_seats`) settled weekly in `server-account/src/npcChapters.js`.

## Eligibility, Scoring, and Allocation

- **Seats and eligibility:** Every chapter has `CHAPTER_SEATS` (`1` Master and `3` Officers), mapped by `SEAT_RANK` to rank `9` and rank `8`. Under `seatEligibleAt` (`src/net/npcChapterLaw.js`), a candidate needs membership, reputation at or above `ROLL_SEAT_LINE` (`80`), `SEAT_TENURE_S` (`14` days) on the Roll, and an account at least `SEAT_ACCOUNT_AGE_S` (`7` days) old. Members pick their target chapter via `/v1/chapters/focus`.
- **Rolling Merit ranking:** `chapterSeatPlan` scores candidates by `seatScoreOf` across `SEAT_MERIT_WEEKS` (`4` weeks) of Merit (`npc_chapter_merit`) with no incumbent multiplier. Ties break by current seat holder, longer guild tenure, and lower character id. Each account holds at most one seat per guild across all regions, each character holds at most one Master seat, and seats without a Merit-earning candidate stay vacant.

## In-Hall Rank Boost, Titles, and Chronicle

- **Hall scope (`seatedBook`):** Holding a seat raises the character's book rank above `7` only at that seat's own chapter halls, and only when the local book row already stands at rank `7`. Clients re-query `/v1/chapters/roll` after `ROLL_SEATS_MS` (`10` min, matching `SHEET_KEPT_MS`), capping roll names at `CHAPTER_ROLL_NAME_MAX` (`32`).
- **Titles and Chronicle:** `CHAPTER_TITLES` (`src/net/identityToken.js`) defines `'chaptermaster'`, `'chapterofficer'`, `'formermaster'`, and `'highmaster'` keyed by `chapterTitleKey` (`faction * 100 + region`). Each weekly change from `seatChangesOf` writes one `npc_chapter_history` row (`/v1/chapters/history`, returning `CHAPTER_CHRONICLE_ROWS = 60` rows in `src/ui/hallOfRecords.js`).
