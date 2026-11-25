---
slug: plain-words-board-seat-and-chapter-guides
title: "Notice Board Seat and Chapter Guides with Preserved Folds"
domain: ui
kind: subcard
parent: plain-words-overview
files:
  - src/ui/seatTab.js
  - src/ui/noticeWindow.js
  - src/net/townSeatLaw.js
  - src/net/npcChapterLaw.js
  - src/ui/enhancedPlusStyle.js
  - server-account/src/npcMerit.js
routes: []
tables: []
replacesBible:
  - "10-UI/Plain-Words.md"
related:
  - plain-words-overview
  - seats-arc-overview
  - chapters-arc-overview
  - chapters-hall-writs-receipts-and-merit
  - npc-chapter-bands-events-and-duties
  - guilds-made-plain-overview
invariants:
  - "`boardFold(make, cls, title, open, chose)` (seatTab.js) builds a details/summary pair and records the reader's choice only from the summary onclick as `d.open === false`, never from the `toggle` event."
  - "Seat guide default: `seatGuideOpen(seat, data)` is open unless the reader guild already holds a pledge in that seat region. The fold state `guideOpen` stays null until the reader acts, and that choice persists across redraws."
  - "Chapter guide default: open unless some Merit row in the region has `merit > 0`. `chapterGuideOpen` stays null until the reader folds or unfolds it."
  - "`chapterGuide()` interpolates CHAPTER_BANDS, CHAPTER_EVENTS, MERIT_WRIT, MERIT_RECEIPT, MERIT_TENURE_S, MERIT_CAP_WEEK, STRENGTH_* , SEAT_RANK, CHAPTER_SEATS, SEAT_MERIT_WEEKS, SEAT_TENURE_S, SEAT_ACCOUNT_AGE_S, and CHAPTER_PATRON_MIN from src/net/npcChapterLaw.js."
traps:
  - "Browsers fire `toggle` for an `open` the draw set as well, so listening to it records the drawn default as a reader choice. A queued echo of that event can undo a fold."
  - "The server sends a Merit row for every membership, including zero (npcMerit.js meritAsks). Folding on 'has any Merit row' would hide the guide from the newest member."
  - "The chapter guide and cards are only drawn when the region has chapters (`writs.chapters.length`)."
dfu: []
tags:
  - notice-board
  - seat-tab
  - chapters
  - fold
  - plain-ui
---

# Notice Board Seat and Chapter Guides with Preserved Folds

The Notice Board Seat and Work tabs render collapsible guides and glossaries whose defaults reflect player progress and whose manual fold states survive redraws.

- **Preserved Fold Mechanism:** `boardFold(make, cls, title, open, chose)` in `src/ui/seatTab.js` builds a `<details>` and `<summary>` pair (styled with a 2px dashed `focus-visible` outline on `.notice-panel > summary` in `src/ui/enhancedPlusStyle.js`) and records user choice only inside the summary `onclick` handler as `d.open === false`, avoiding browser `toggle` event echoes.
- **Seat Tab Ordering and Law Interpolation:** `SEAT_PANELS` orders `'What this is'`, `'How the seat war works'`, and `'Words on this board'` ahead of the week, battle, standings, company, holder, and Chronicle panels. `seatGuideOpen(seat, data)` defaults open unless the player guild holds a pledge in that region, while `seatAbout`, `seatNextStep`, and `seatMayPledgeHere` explain next steps and deadlines using constants from `src/net/townSeatLaw.js` (`CLAIM_THRESHOLD`, `CONTESTED_MARGIN`, `STANDING_START`, `STANDING_UNREST`, `UNREST_BONUS`, `TITHE_CAP`, `TRIBUTE_MARKS_PER_INFLUENCE`, `SEAT_PLEDGE_REGIONS_MAX`, and `SEAT_LEGACY_SHARE`).
- **Chapter Guide and Cards:** When `writs.chapters.length` is non-zero, `src/ui/noticeWindow.js` draws `chapterGuide()` (`CHAPTER_GUIDE_TITLE` `'How chapters work'`) above `chapterCard(c)` using constants from `src/net/npcChapterLaw.js`, defaulting open until a regional row from `server-account/src/npcMerit.js` (`meritAsks`) has `merit > 0`.
