---
slug: "ledger-law-craft-hand-overs-and-excuse-values"
title: "Craft Record Hand-Overs and Value-Scoped Staff Excuses"
domain: "economy"
kind: "subcard"
parent: "ledger-law-pose-freshness-and-room-caps-overview"
files:
  - "server-account/src/ledger.js"
  - "server-account/src/marketSettle.js"
  - "server-account/src/writs.js"
  - "server-account/src/judge.js"
  - "server-account/src/verdict.js"
  - "server-account/src/review.js"
  - "server-account/src/service.js"
  - "server-account/migrations/0178_rpt1026_ledgerlaw.sql"
  - "src/items/foundMark.js"
  - "src/trade/repairService.js"
  - "src/justice/stolenGoods.js"
routes:
  - "/v1/mod/realm-clear"
  - "/v1/mod/realm-trades"
tables:
  - "products"
  - "realm_characters"
  - "item_uids"
  - "item_dupes"
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26r.md"
related:
  - "ledger-law-pose-freshness-and-room-caps-overview"
  - "economy-ledger-and-item-judge"
  - "integrity-item-law-holds-and-wealth-budget"
  - "gold-int-caps-and-realm-review-routes"
invariants:
  - "Contested crafted-piece claims settle for CRAFT_RECORD_SQL = COALESCE(p.handed_to, p.owner) (server-account/src/ledger.js), never the owner alone."
  - "ledgerMoves writes products.handed_to only when COALESCE(handed_to, owner) matches the giver (or the escrow holder), and NULLs it when the receiver is the owner."
  - "Market sale settles (server-account/src/marketSettle.js) and commission fills (server-account/src/writs.js) clear handed_to."
  - "judge.js lawValuesOf records code@at=value pairs, capped at LAW_VALUES_MAX = 1000 and marked with LAW_VALUES_CUT. verdict.js stores them as realm_characters.law_v beside law_sig."
traps:
  - "/v1/mod/realm-clear (review.js clear) writes law_excused as law_sig|law_v. A bare law_sig excuse written before the fix covers item findings only, so a cleared negative purse no longer excuses later purses."
  - "Staff excuses never match states containing `LAW_VALUES_CUT`, preventing truncated value lists from masking overflow findings."
  - "foundMark.spendOwnMends clamps selfMended to currentCondition above the found mark before own mends and paid repairs (repairService repairWhole)."
dfu: []
tags:
  - "ledger"
  - "provenance"
  - "item-law"
  - "staff-review"
  - "crafting"
---

# Craft Record Hand-Overs and Value-Scoped Staff Excuses

Migration `0178_rpt1026_ledgerlaw.sql` (`server-account/migrations/0178_rpt1026_ledgerlaw.sql`) extends `products` and `realm_characters` in `server-account/src/service.js` so crafted provenance tracks hand-overs and staff excuses bind to finding values.

- **Craft custody hand-overs:** In `server-account/src/ledger.js` (`DUPE_GRACE_S = 750` across `item_uids` and `item_dupes`), contested crafted claims settle for `CRAFT_RECORD_SQL = COALESCE(p.handed_to, p.owner)`, never the owner alone (`handed_to` is `NULL` before migration `0178`). `ledgerMoves` writes `products.handed_to` only when `COALESCE(handed_to, owner)` matches the giver or escrow holder, `NULL`s it when returned to the owner, and clears it on market sales (`server-account/src/marketSettle.js`) and commission fills (`server-account/src/writs.js`).
- **Value-scoped law excuses:** `lawValuesOf` (`server-account/src/judge.js`) records `code@at=value` pairs up to `LAW_VALUES_MAX = 1000` (marking overflow with `LAW_VALUES_CUT`), stored by `server-account/src/verdict.js` as `realm_characters.law_v` beside `law_sig`. In `server-account/src/review.js` (`/v1/mod/realm-clear` and `/v1/mod/realm-trades`), `clear` writes `law_excused` as `law_sig|law_v`; bare pre-fix `law_sig` excuses cover item findings only, and states with `LAW_VALUES_CUT` never match.
- **Mends and stolen tags:** `spendOwnMends` (`src/items/foundMark.js`) clamps `selfMended` to `currentCondition` above the found mark before own mends or `repairWhole` (`src/trade/repairService.js`), while stolen pieces show `stolen.tag` (`src/justice/stolenGoods.js`) in market, vendor, and trade rows.
