---
slug: chapters-roll-reputation-and-customs
title: "The Roll: Server Guild Reputation, Pace, and Customs Ceilings"
domain: multiplayer
kind: subcard
parent: chapters-arc-overview
files:
  - src/net/npcChapterLaw.js
  - server-account/src/npcRoll.js
  - src/net/bunnyGuildLaw.js
routes:
  - /v1/chapters/roll
  - /v1/chapters/claim
tables:
  - npc_roll_heads
  - npc_roll
  - npc_rep_events
replacesBible:
  - "11-Multiplayer/Chapters-Arc.md"
related:
  - chapters-arc-overview
  - chapters-contested-seats-and-titles
  - iliac-card-items-sources-and-customs
invariants:
  - "`ROLL_FACTIONS` = DFU guild, divine, and order faction ids plus `BUNNY_FACTIONS` (2001-2007). Factions outside it stay in the local save."
  - "`rollCredit` slows every online gain by `ROLL_GAIN_SLOW` (1.75): it credits the whole part of delta / 1.75, plus one more point when the claim's roll falls under the fraction. Losses are taken from `owed` first."
  - "`ROLL_GAIN_DAY_MAX` is `Number.MAX_SAFE_INTEGER`: there is no daily cap."
  - "`rollSeedCapOf` caps a customs crossing created at or after `ROLL_EPOCH_S` (1_791_417_600) at `ROLL_CUSTOMS_CAP` (40). Earlier crossings and characters born online seed uncapped."
  - "`rollRankKeepOf` lets a member keep its rank band through the cap but never above `ROLL_SEAT_LINE - 1` (79). An imported rank 8 or 9 is reviewed down to rank 7."
  - "`rollBookRankOf` and `rollBookCap` hold the book's own rank at `ROLL_BOOK_RANK_MAX` (7)."
traps:
  - "A client sends at most one claim every `ROLL_CLAIM_MS` (60 s). The server refuses more than `ROLL_CLAIMS_HOUR` (120) claims per character per hour with 'roll-rate'."
  - "`npc_rep_events` rows are pruned after `ROLL_EVENTS_KEEP_S` (90 days) by the character's next claim."
  - "The last adoption is saved under the mod-save vendor `ROLL_KEPT_VENDOR` ('ChaptersRoll'). `rollAdopt` keeps unsent local drift on top of the server's number."
  - "`ROLL_DELTA_MAX` is the full span `MAX_REPUTATION - MIN_REPUTATION`. A claim line larger than that is rejected by `rollDeltasOk`."
dfu:
  - Guild.cs
  - GuildManager.cs
tags:
  - roll
  - reputation
  - customs
  - bunny-pace
---

# The Roll: Server Guild Reputation, Pace, and Customs Ceilings

`server-account/src/npcRoll.js` and `src/net/npcChapterLaw.js` track online guild membership and reputation across `npc_roll_heads`, `npc_roll`, and `npc_rep_events` via `/v1/chapters/roll` and `/v1/chapters/claim`. `ROLL_FACTIONS` combines standard Daggerfall Unity guild, divine, and order ids with the seven Bunnyfall guilds (`BUNNY_FACTIONS`, ids `2001` through `2007` in `src/net/bunnyGuildLaw.js`); all other factions stay in the local save.

## Books, Pacing, and Claim Limits

- **Books and joins:** `ROLL_BOOKS` (`2`) tracks mortal and vampire books. Under `joinRecordable`, hidden guilds (`hallHidden`: Thieves Guild and Dark Brotherhood) record joins at any standing; other guilds require `RANK_REQ_REPUTATION[0]`. `rollBookRankOf` and `rollBookCap` hold book rank at `ROLL_BOOK_RANK_MAX` (`7`).
- **Gain pacing:** `rollCredit` divides positive online deltas by `ROLL_GAIN_SLOW` (`1.75`), crediting the integer part plus one point when the claim roll falls under the remainder. Losses deduct from `npc_roll.owed` first. Because `ROLL_GAIN_DAY_MAX` is `Number.MAX_SAFE_INTEGER`, there is no daily cap and `owed` drains in full on the next claim.
- **Sync and rate limits:** Clients send claims at most every `ROLL_CLAIM_MS` (`60` s). The server rejects over `ROLL_CLAIMS_HOUR` (`120`) hourly claims with `'roll-rate'` or deltas above `ROLL_DELTA_MAX` (`rollDeltasOk`). `rollAdopt` saves under vendor `ROLL_KEPT_VENDOR` (`'ChaptersRoll'`), keeping unsent local drift, and prunes `npc_rep_events` after `ROLL_EVENTS_KEEP_S` (`90` days).

## Customs Ceilings

For customs crossings at or after `ROLL_EPOCH_S` (`1_791_417_600`), `rollSeedCapOf` caps standing at `ROLL_CUSTOMS_CAP` (`40`), while `rollRankKeepOf` keeps rank standing up to `ROLL_SEAT_LINE - 1` (`79`), reviewing imported rank `8` or `9` down to `7`.
