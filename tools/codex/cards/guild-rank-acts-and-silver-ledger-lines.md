---
slug: guild-rank-acts-and-silver-ledger-lines
title: "Guild Rank Acts and Treasury Ledger Wording"
domain: multiplayer
kind: subcard
parent: guilds-made-plain-overview
files:
  - src/net/guildPowers.js
  - src/net/guildLaw.js
  - src/net/hallLaw.js
  - src/net/writLaw.js
  - src/net/townSeatLaw.js
  - src/net/marksLaw.js
  - src/ui/socialPanel.js
  - server-account/src/guilds.js
routes:
  - /v1/guilds/rank
  - /v1/guilds/ranks
  - /v1/marks/guild/deposit
  - /v1/marks/guild/withdraw
  - /v1/guilds/deposit
  - /v1/guilds/withdraw
tables:
  - guild_members
  - guild_ledger
  - guild_marks
replacesBible:
  - "11-Multiplayer/Guilds-Made-Plain.md"
related:
  - guilds-made-plain-overview
  - guild-window-and-member-presence
  - professions-marks-and-silver-finds
  - seats-witness-registry-and-influence
invariants:
  - "Domain permission tables remain in their owning modules (`GUILD_POWERS` in `src/net/guildLaw.js`, `HALL_POWERS` in `src/net/hallLaw.js`, `WRIT_POWERS` in `src/net/writLaw.js`, and `SEAT_POWERS` plus `SEAT_LEVER_RANKS` in `src/net/townSeatLaw.js`); `src/net/guildPowers.js` only composes them."
  - "`GUILD_RANK_ACTS` derives every rank capability from those tables, predicate rules (`writDeliverMay`, `contractPaidMay`), `'any'`, `'master'`, or vault defaults, ensuring UI descriptions never drift from `guildMay`, `hallMay`, `writMay`, and `seatMay`."
  - "Treasury ledger wording follows both entry kind and direction so funds leaving `guild_ledger` or `guild_marks` never read as deposits."
traps:
  - "Only `GUILD_SILVER_MEMBER_KINDS` format the acting member as the grammatical subject; for all other kinds, `who` is a service label and the entry reads as an action by or upon the guild."
  - "Bidirectional ledger kinds (`'conscription'` and `'fealty-tribute'`) carry separate `in` and `out` wording templates."
  - "Live currency labels come from `marksText` in `src/net/marksLaw.js` (`'Imperial Argents'`); never hardcode `'silver'` or `'Marks'` in new UI strings."
dfu: []
tags:
  - guilds
  - ranks
  - permissions
  - ledger
  - guild3b
---

# Guild Rank Acts and Treasury Ledger Wording

`src/net/guildPowers.js` and `src/ui/socialPanel.js` generate rank permission summaries and directional treasury ledger lines for the Company window (`server-account/src/guilds.js`).

## Composed Rank Acts (`src/net/guildPowers.js`)

Rather than maintaining hand-written permission prose that can drift from runtime guards (`guildMay`, `hallMay`, `writMay`, and `seatMay`), `GUILD_RANK_ACTS` binds each capability label directly to `GUILD_POWERS` (`src/net/guildLaw.js`), `HALL_POWERS` (`src/net/hallLaw.js`), `WRIT_POWERS` (`src/net/writLaw.js`), `SEAT_POWERS` and `SEAT_LEVER_RANKS` (`src/net/townSeatLaw.js`), rule helpers (`writDeliverMay` and `contractPaidMay`), `'any'`, `'master'`, or the rank's default vault level.

- `guildRankActsText(rank)` joins the capabilities granted at a single `guild_members` rank into one sentence for rank changes (`POST /v1/guilds/rank` and `POST /v1/guilds/ranks`).
- `rankLinesOf(acts, names)` renders each tier as an incremental delta above the preceding rank (for example, `"Everything the Officer may, and: ..."`).
- `guildRealmGoldText` and `guildHallGoldText` explain how realm-earned gold (`guilds.realm_gold`) backs guild purchases (`/v1/guilds/deposit` and `/v1/guilds/withdraw`).

## Directional Ledger Lines (`GUILD_SILVER_LINE_WORDS`)

On the server (`server-account/src/guilds.js`), `GUILD_MARKS_LINE_KIND` maps raw `MARKS_KINDS` entries (`src/net/marksLaw.js`, mutated via `/v1/marks/guild/deposit` and `/v1/marks/guild/withdraw`) to display kinds. On the client (`src/ui/socialPanel.js`), `GUILD_SILVER_LINE_WORDS` formats each `guild_ledger` and `guild_marks` row by kind and sign: member-initiated kinds in `GUILD_SILVER_MEMBER_KINDS` name the member as subject, system kinds treat the guild as subject, and two-way kinds (`'conscription'` and `'fealty-tribute'`) select between `in` and `out` templates while using `marksText` (`'Imperial Argents'`) for currency naming.
