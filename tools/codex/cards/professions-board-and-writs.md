---
slug: professions-board-and-writs
title: "Notice Board Notes, Court and Guild Writs, Commissions, Crafting Writs"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/boardLaw.js
  - src/net/noticeBook.js
  - src/net/writLaw.js
  - src/net/writBook.js
  - src/net/craftWritLaw.js
  - src/ui/noticeWindow.js
  - src/ui/workTab.js
  - src/ui/workSift.js
  - server-account/src/board.js
  - server-account/src/writs.js
  - server-account/src/craftWrits.js
routes:
  - /v1/board/read
  - /v1/board/pin
  - /v1/board/report
  - /v1/board/take-down
  - /v1/writs/list
  - /v1/writs/post
  - /v1/writs/supply
  - /v1/writs/withdraw
  - /v1/writs/budget
  - /v1/writs/commission
  - /v1/writs/fulfil
  - /v1/writs/cancel
  - /v1/writs/decline
  - /v1/writs/craft
tables:
  - board_notes
  - board_reports
  - board_notices
  - writs
  - writ_days
  - guild_writs
  - guild_writ_fills
  - guild_writ_budgets
  - guild_prof_stores
  - guild_store_ledger
  - guild_store_moves
  - commissions
  - craft_writs
replacesBible:
  - "06-Systems/Professions-Arc.md"
related:
  - professions-arc-overview
  - professions-market-auctions-and-orders
  - market-vendors-and-professions
invariants:
  - "`NOTES_LIVE_MAX` allows 3 live notes per account for `NOTE_DAYS` (1, 3, or 7 days), using subject, body, and line limits re-exported from `letterLaw.js` (60, 800, and 40)."
  - "`NOTE_REPORTS_HIDE` (3) counts only reports from accounts that are neither muted nor sprouts."
  - "`courtWritCount` seeds `6 * max(1, ceil(active / 100))` regional writs per UTC day, and `COURT_WRITS_PER_DAY` caps fills at 3 per account."
  - "`GUILD_WRITS_MAX` caps open guild writs at 20 per guild; `COMMISSIONS_MAX` allows 5 open commissions per poster and `COMMISSIONS_FOR_MAX` allows 20 per named crafter."
  - "Crafting writs (`CRAFT_WRIT_SLOTS = 3` per day) pay `CRAFT_PAY_PCT = 150` with a 20-Mark floor and a `CRAFT_WRIT_PAY_MAX = 200` ceiling."
traps:
  - "`board_notes` and `writs` were rebuilt in `0034_writs.sql` and `0099_npc_halls.sql`, superseding the initial `0026` and `0027` table definitions."
  - "`NOTES_PINNED_MAX` limits pins to 10 per hour, while `BOARD_OPS_MAX` caps all board actions at 60 per hour."
tags:
  - notice-board
  - writs
  - commissions
  - guild-stores
  - craft-writs
---

Town notice boards (`src/ui/noticeWindow.js`, `src/ui/workTab.js`, and `src/ui/workSift.js`) combine player notes, notices, Court writs, guild supply orders, private commissions, and daily crafting writs.

## Notice Board Notes and Moderation

`src/net/boardLaw.js`, `src/net/noticeBook.js`, and `server-account/src/board.js` serve `/v1/board/read` (`BOARD_CACHE_MS` 60,000), showing up to `BOARD_NOTES_SHOWN` (30) player notes (`board_notes`) and `BOARD_NOTICES_SHOWN` (20) notices (`board_notices`, up to `NOTICE_DAYS_MAX` 14 days). Accounts keep `NOTES_LIVE_MAX` (3) live notes via `/v1/board/pin` and `/v1/board/take-down` for `NOTE_DAYS` (1, 3, or 7) with `NOTE_BUTTONS` (`party`, `guild`, `duel`, and `commission`). Text bounds follow `letterLaw.js` (60 subject chars, 800 body chars, and 40 lines). Pinning caps at `NOTES_PINNED_MAX` (10/h) inside `BOARD_OPS_MAX` (60/h). Three valid `/v1/board/report` filings (`board_reports`, `NOTE_REPORTS_HIDE` 3, excluding muted or sprout accounts) hide a note.

## Court Writs, Guild Writs, Commissions, and Crafting Writs

`src/net/writLaw.js`, `src/net/writBook.js`, and `server-account/src/writs.js` handle contracts across `/v1/writs/list`, `/v1/writs/post`, `/v1/writs/supply`, `/v1/writs/withdraw`, `/v1/writs/budget`, `/v1/writs/commission`, `/v1/writs/fulfil`, `/v1/writs/cancel`, and `/v1/writs/decline`:

- **Court and guild writs:** `courtWritCount` seeds `6 * max(1, ceil(active / 100))` regional rows (`writs`) per UTC day, and accounts fill `COURT_WRITS_PER_DAY` (3 in `writ_days`). Guilds hold up to `GUILD_WRITS_MAX` (20) open orders (`guild_writs`, `guild_writ_fills`, and `guild_writ_budgets`) backed by `guild_prof_stores`, `guild_store_ledger`, and `guild_store_moves`.
- **Commissions and crafting writs:** Posters open up to `COMMISSIONS_MAX` (5) contracts (`commissions`, `COMMISSIONS_FOR_MAX` 20 per crafter). `src/net/craftWritLaw.js` and `server-account/src/craftWrits.js` (`/v1/writs/craft`, `craft_writs`) offer `CRAFT_WRIT_SLOTS` (3/day) across `CRAFT_KINDS` (`potion` and `dish` to Provisioning, with `NOVICE_YIELD.potion` 2; `kit` to Smithing), paying `CRAFT_PAY_PCT` (150%, floor 20, cap `CRAFT_WRIT_PAY_MAX` 200).
