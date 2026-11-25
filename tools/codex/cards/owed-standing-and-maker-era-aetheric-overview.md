---
slug: owed-standing-and-maker-era-aetheric-overview
title: "Owed Guild Standing and Maker-Era Aetheric Rows"
domain: guilds
kind: overview
parent: null
files:
  - src/net/npcChapterLaw.js
  - src/guilds/guildServiceFlow.js
  - src/guilds/guilds.js
  - src/items/itemLaw.js
  - src/magic/enchanting.js
  - server-account/src/judge.js
  - server-account/src/realm.js
  - server-account/migrations/0123_maker_kept.sql
routes: []
tables:
  - realm_characters
  - realm_findings
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-16c.md"
related:
  - gather-hover-lock-and-automap-layout-keep
  - guild-repute-gate-and-standing-pace
  - integrity-item-law-holds-and-wealth-budget
invariants:
  - "Owed standing (standingOwedOf) counts only against expulsion in guild review. It never ends probation and never buys rank."
  - "`MAKER_ERA_AETHERIC` keeps maker rows only on Ruhn Regalia and the raid set pieces; later Aetheric sets and Gilded pieces may not carry them."
  - "Migration 0123 never touches staff holds and leaves law_sig unchanged."
traps:
  - "ROLL_GAIN_DAY_MAX is now Number.MAX_SAFE_INTEGER (no daily cap). Pace comes from ROLL_GAIN_RATE."
  - "Do not hardcode ITEM_LAW_VERSION."
dfu: []
tags:
  - owed-pace
  - maker-kept
  - item-law
  - probation
---

# Owed Guild Standing and Maker-Era Aetheric Rows

Owed guild reputation accounting, standing gain pacing, and maker-era Aetheric enchantment exemptions are coordinated across `src/net/npcChapterLaw.js`, `src/guilds/guildServiceFlow.js`, `src/guilds/guilds.js`, `src/items/itemLaw.js`, `src/magic/enchanting.js`, `server-account/src/judge.js`, and `server-account/src/realm.js`.

## Owed Standing and Reputation Pace

- **Review scope of owed standing (`standingOwedOf`):** During guild reviews in `src/guilds/guilds.js` and `src/guilds/guildServiceFlow.js`, owed standing counts strictly against expulsion (`standing + owed` compared against `GUILD_EXPEL_BELOW`). It never lifts probation early and never satisfies rank promotion thresholds.
- **Roll credit and drain:** `rollCredit`, `rollDrain`, and `joinRecordable` in `src/net/npcChapterLaw.js` (mirrored by `server-account/src/npcRoll.js`) pace reputation gains through `ROLL_GAIN_RATE`, while `ROLL_GAIN_DAY_MAX` equals `Number.MAX_SAFE_INTEGER` with no daily cap.

## Maker-Era Aetheric Rows and Migration 0123

In `src/items/itemLaw.js` and `src/magic/enchanting.js`, `MAKER_ERA_AETHERIC` permits retained maker enchantment rows only on Ruhn Regalia and the raid set pieces; later Aetheric sets and Gilded pieces cannot carry maker rows. Account hold evaluation (`holdRefusal` in `server-account/src/judge.js` and `server-account/src/realm.js`) pairs with `server-account/migrations/0123_maker_kept.sql`, which records `{act:'clear', by:'maker-kept', was, until, strikes, served}` in `realm_findings` and clears `hold`, `strikes`, and `law_holds` on `realm_characters` when the only findings were `'aetheric'` or `'enchantments'` on those templates, leaving staff holds and `law_sig` untouched.
