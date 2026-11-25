---
slug: guild-rename-and-name-filter
title: "Guild Rename: Treasury Fee, Cooldown, Seat-Battle Lock, and Word Filter"
domain: account
kind: subcard
parent: guild-overhaul-overview
files:
  - server-account/src/guilds.js
  - src/net/guildLaw.js
  - src/net/bunnyGuildLaw.js
  - src/net/townSeatLaw.js
  - src/ui/socialPanel.js
  - src/net/accountClient.js
routes:
  - /v1/guilds/rename
tables:
  - guilds
  - guild_members
  - guild_renames
  - homes
  - town_seat_battles
replacesBible:
  - "11-Multiplayer/Guild-Overhaul.md"
related:
  - guild-overhaul-overview
  - homes-camps-guilds-and-territories
  - seats-arc-overview
invariants:
  - "Only the guildmaster can rename a guild: `GUILD_POWERS.rename` is `[0]`, and the update batch requires a `guild_members` row at `GUILD_RANK_MASTER`."
  - "The rename fee deducts from `guilds.realm_gold` alongside `guilds.treasury`, rejecting the batch with `guild-rename-gold` when `realm_gold < cost`."
  - "`GUILD_RENAME_COOLDOWN_S` (`14` days) is enforced in SQL via `renamed_at IS NULL OR renamed_at + cooldown <= now`."
  - "Renames are blocked during any `seatWeekOf` week in which the guild is an attacker or defender in `town_seat_battles` with `state <> 'void'`."
  - "The same D1 batch inserts an audit row in `guild_renames` and updates `homes.owner_name` on the guild hall."
traps:
  - "The rename charge is `companyRenameCost(GUILD_RENAME_GOLD, adventurersRank)`, which discounts `GUILD_RENAME_GOLD` (`25,000`) by `RENAME_RANK_OFF` (`5%`) per Adventurers Guild rank up to 9 ranks; never hardcode `25,000` as the final fee."
  - "`guildWordsOk` evaluates each word by its extracted letters, so purely numeric tokens (such as `'7'` or tag `'22'`) pass without being rejected as empty."
  - "A concurrent name or tag collision throws a unique constraint error during `db.batch`; the catch block re-queries `guilds` to return the specific conflict code."
dfu: []
tags:
  - guilds
  - rename
  - treasury
  - profanity-filter
  - seats
---

# Guild Rename: Treasury Fee, Cooldown, Seat-Battle Lock, and Word Filter

`renameGuild` (`POST /v1/guilds/rename` in `server-account/src/guilds.js`, called via `src/net/accountClient.js` and `src/ui/socialPanel.js`) lets a guildmaster change both the guild name and tag under shared validation rules (`src/net/guildLaw.js`) in a single atomic D1 batch.

- **Name, tag, and word filtering (`src/net/guildLaw.js`):** Before hitting D1, `renameGuild` validates the candidate name and tag syntax and runs `guildWordsOk`. `guildWordsOk` checks each word across its letter characters against blocked terms while permitting purely numeric tokens such as `'7'` or tag `'22'` that contain zero letters.
- **Rank-discounted treasury fee (`src/net/bunnyGuildLaw.js`):** `GUILD_RENAME_GOLD` (`25,000` gold) is only the base fee. `renameGuild` charges `companyRenameCost(GUILD_RENAME_GOLD, rank)`, which applies a `RENAME_RANK_OFF` (`5%`) discount per Adventurers Guild rank (up to 9 ranks). The batch debits `guilds.realm_gold` and `guilds.treasury` together, returning `guild-rename-gold` if `realm_gold` cannot cover the discounted cost.
- **Cooldown, seat-battle lock, and hall propagation:** The SQL guard enforces `GUILD_RANK_MASTER` (`GUILD_POWERS.rename = [0]`), checks `GUILD_RENAME_COOLDOWN_S` (`14 * 24 * 3600` seconds) against `guilds.renamed_at`, and verifies that the guild is neither attacker nor defender in an active (`state <> 'void'`) `town_seat_battles` row for the current `seatWeekOf` week (`src/net/townSeatLaw.js`). In the same batch, `renameGuild` records the change in `guild_renames`, updates `homes.owner_name` for any owned guild hall, and writes a `'rename'` treasury ledger entry (`GUILD_LEDGER_WORDS` in `src/ui/socialPanel.js`).
