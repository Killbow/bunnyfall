---
slug: guild-disband-holds-and-refusals
title: "Guild Disband Holds and Whole-List Refusals"
domain: multiplayer
kind: subcard
parent: guilds-made-plain-overview
files:
  - server-account/src/guilds.js
  - src/ui/socialPanel.js
  - server-account/src/routes/townRoutes.js
routes:
  - /v1/guilds/disband
  - /v1/guilds/leave
  - /v1/guilds/handover
  - /v1/guilds/mine
tables:
  - guilds
  - guild_members
  - guild_marks
  - guild_prof_stores
  - guild_writs
  - guild_contracts
  - guild_vault
  - homes
  - town_seat_holds
  - town_seat_rights
  - npc_chapter_patron_bids
replacesBible:
  - "11-Multiplayer/Guilds-Made-Plain.md"
  - "01-Overview/audits/Audit-Guild3.md"
related:
  - guilds-made-plain-overview
  - guild-item-vault-and-withdraw-grants
  - seats-weekly-turning-and-holding
  - professions-board-and-writs
invariants:
  - "Module-private `GUILD_HOLDS` (`server-account/src/guilds.js`) is the single source of truth for both `guildKeepsSql` (the `endGuild` SQL `DELETE` gate) and `GUILD_HOLDS_SQL` / `guildHolds` (the guildmaster Settings preflight list)."
  - "`endGuild` deletes a guild only when `guilds.treasury = 0`, `guild_marks` has no positive balance after `guildMarksSweep`, and every `GUILD_HOLDS` predicate evaluates to false inside one D1 `db.batch`."
  - "When disbanding or leaving is blocked, `whyNotGone` returns `error` set to the first hold code and `keeps` (`notGone`) containing the complete ordered array of active hold codes."
traps:
  - "Unreturned escrow on closed writs or contracts triggers `'guild-writ-escrow'`, which is tracked separately from `guilds.treasury` and from open writs (`'guild-writs'`)."
  - "`'marks-full'` blocks disband when sweeping the guild's `guild_marks` balance into the guildmaster's personal account via `guildMarksSweep` would exceed `MARKS_MAX`."
  - "A guildmaster calling `POST /v1/guilds/leave` while other members remain receives `'guild-master-leaves'` and must use `POST /v1/guilds/handover` first, whereas `POST /v1/guilds/disband` requires no handover because all `guild_members` rows end with the guild."
  - "Client `GUILD_HOLD_CODES` (`src/ui/socialPanel.js`) must stay synchronized with server `GUILD_HOLD_KEEP_CODES` (deduplicating the two `'guild-writ-escrow'` rows in `GUILD_HOLDS`)."
  - "Closed escrow predicates must keep unary `+returned = 0` so SQLite uses the `(guild_id, state)` index rather than scanning realm-wide unreturned indexes."
dfu: []
tags:
  - guilds
  - disband
  - holds
  - refusals
  - guild3c
---

# Guild Disband Holds and Whole-List Refusals

`server-account/src/guilds.js` and `src/ui/socialPanel.js` (with seat hold checks shared by `server-account/src/routes/townRoutes.js`) guarantee that a guildmaster sees every active blocker on the Settings page (`GET /v1/guilds/mine`) before pressing Disband (`POST /v1/guilds/disband`) or Leave (`POST /v1/guilds/leave`), and receives the full list of remaining holds in a single refusal payload.

## Single Hold Definition (`GUILD_HOLDS`)

Both `guildKeepsSql` (exported to gate the atomic `DELETE FROM guilds` batch in `endGuild`) and `GUILD_HOLDS_SQL` (executed in one query by `guildHolds`) are generated from `GUILD_HOLDS`. `whyNotGone(db, guildId, { alone, account })` evaluates and returns active holds in fixed priority order:

1. `guild-treasury`: non-zero gold in `guilds.treasury`.
2. `guild-stores`: materials remaining in `guild_prof_stores`.
3. `guild-writs`: open writs in `guild_writs`.
4. `guild-writ-escrow`: unreturned escrow on closed rows in `guild_writs` or `guild_contracts` (deduplicated in `GUILD_HOLD_KEEP_CODES`).
5. `guild-contracts`: active contracts in `guild_contracts`.
6. `guild-hall`: an owned guild hall in `homes`.
7. `guild-vault`: items stored in `guild_vault` (`guild-item-vault-and-withdraw-grants`).
8. `guild-seat` and `guild-battle`: held town seats or active rights/challenges in `town_seat_holds` and `town_seat_rights` (`seats-weekly-turning-and-holding`).
9. `guild-patron`: active chapter bids in `npc_chapter_patron_bids`.
10. `marks-full`: `guildMarksSweep` from `guild_marks` would push the guildmaster past `MARKS_MAX`.

When a guildmaster attempts `/v1/guilds/leave` while not `alone`, `whyNotGone` also appends `guild-master-leaves`.
