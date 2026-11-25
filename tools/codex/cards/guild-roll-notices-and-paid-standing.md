---
slug: "guild-roll-notices-and-paid-standing"
title: "Guild Roll Notices, Owed Standing, and Paid Responses"
domain: "guilds"
kind: "subcard"
parent: "guild-probation-reviews-and-online-repute-overview"
files:
  - "server-account/src/npcRoll.js"
  - "src/net/npcChapterLaw.js"
  - "src/net/npcRollTracker.js"
  - "src/guilds/rollNoticeHost.js"
  - "server-account/src/routes/townRoutes.js"
routes:
  - "/v1/chapters/roll"
  - "/v1/chapters/claim"
tables:
  - "npc_roll"
  - "npc_roll_heads"
replacesBible:
  - "01-Overview/audits/Audit-Guild-Words.md"
related:
  - "guild-probation-reviews-and-online-repute-overview"
  - "chapters-roll-guarantees-overview"
  - "chapters-roll-reputation-and-customs"
  - "guild-repute-gate-and-standing-pace"
invariants:
  - "readRoll and claimRoll may return `paid`, the owed standing this response paid out, by faction."
  - "rollMovesOf separates pure standing moves from owed conversions."
  - "A lease stop on the Roll tracker keeps owed standing; only a terminal stop clears it."
traps:
  - "There is no daily gain cap any more (ROLL_GAIN_DAY_MAX = Number.MAX_SAFE_INTEGER); gains are slowed by ROLL_GAIN_SLOW."
  - "A chapter writ credits HALL_WRIT_REP (2)."
dfu: []
tags:
  - "roll"
  - "standing"
  - "notices"
  - "i18n"
---

# Guild Roll Notices, Owed Standing, and Paid Responses

Account service routes `/v1/chapters/roll` and `/v1/chapters/claim` (`server-account/src/routes/townRoutes.js` and `server-account/src/npcRoll.js`) persist faction standing and pending owed balances across the `npc_roll` and `npc_roll_heads` SQLite tables. Under `src/net/npcChapterLaw.js`, `ROLL_GAIN_DAY_MAX` is set to `Number.MAX_SAFE_INTEGER` so daily gains have no hard cap and instead pace through `ROLL_GAIN_SLOW`, while redeeming a chapter writ credits `HALL_WRIT_REP` (`2`).

## Paid Standing Responses and Roll Tracker Lifecycle

Both `readRoll` and `claimRoll` in `server-account/src/npcRoll.js` can return a `paid` map recording the owed standing paid out by faction during that response. On the client, `src/net/npcRollTracker.js` processes the payload through `rollMovesOf` (`src/net/npcChapterLaw.js`), separating direct standing changes from owed-to-active conversions before emitting standing events. If the Roll tracker encounters a temporary lease stop, it preserves all cached owed standing; only a terminal stop clears the owed state.

## Localized Roll Notice Formatting

When `src/guilds/rollNoticeHost.js` renders standing and payment banners, it resolves guild names through localized string keys (`hallPosterName`) rather than raw faction table labels and formats multi-guild lists with `Intl.ListFormat` in the active locale, falling back to comma joining.
