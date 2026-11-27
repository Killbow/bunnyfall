---
slug: gold-int-caps-and-realm-review-routes
title: "GOLD_INT_MAX Caps, Purse Law, and Realm Review Routes"
domain: economy
kind: subcard
parent: peer-word-letters-and-worn-offers-overview
files:
  - src/items/itemLaw.js
  - src/formats/saveTreeFile.js
  - server-account/src/judge.js
  - server-account/src/review.js
  - server-account/src/service.js
  - server-account/src/verdict.js
  - server-account/src/decor.js
  - tools/realmReview.mjs
  - server-account/migrations/0096_integrity.sql
  - src/items/itemIds.js
  - src/items/possessedItems.js
  - src/world/sceneCache.js
  - src/net/realmGoldLaw.js
  - src/homes/realmHoldHost.js
routes:
  - /v1/mod/realm-gains
  - /v1/mod/realm-trades
tables:
  - item_uids
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12f.md"
related:
  - peer-word-letters-and-worn-offers-overview
  - economy-ledger-and-item-judge
  - integrity-item-law-holds-and-wealth-budget
invariants:
  - "GOLD_INT_MAX = 2147483647 mirrors DFU int goldPieces, value and stackCount."
  - "CLASSIC_VALUE_MAX = 4294967295 covers classic save getUint32 records."
  - "judge.js purseWord rejects a purse above GOLD_INT_MAX as a law finding."
  - "Each realm checkpoint (`realmCheckpoint` calls `stampItemIds`) stamps a random 16-hex `uid` on every valuable piece that lacks one and is not a stack, bound, or a quest item. The piece keeps that `uid` through saves, the wire, and trades."
  - "`possessedItemLists` (`src/items/possessedItems.js`) is the one list walk for the server item judge, the id ledger, and the client hold check (`src/homes/realmHoldHost.js`). It never includes ground piles, dungeon chests, bodies, or shop shelves."
traps:
  - "verdict.js clean ignores budget findings, so inflated checkpoints can be rollback points."
  - "decor.js removal refunds half of cost without holds."
  - "`ITEM_LAW_VERSION` must increase on any rule change. Each finding records the law version that made it (the `law` column of `realm_findings`), which tells staff which older findings to review again under the new law."
  - "The interior scene name in `src/items/possessedItems.js` must match `interiorSceneName` in `src/world/sceneCache.js` and `src/net/realmGoldLaw.js`, or a rented room chest drops out of the walk."
dfu:
  - PlayerEntity.cs
  - DaggerfallUnityItem.cs
  - DaggerfallBankingWindow.cs
tags:
  - gold-int
  - moderation
  - review
---

# GOLD_INT_MAX Caps, Purse Law, and Realm Review Routes

Integer gold ceilings, checkpoint purse validation, and moderator audit routes are implemented across `src/items/itemLaw.js`, `src/formats/saveTreeFile.js`, `server-account/src/judge.js`, `server-account/src/review.js`, and `tools/realmReview.mjs`, backed by the `item_uids` table in `server-account/migrations/0096_integrity.sql`.

## Integer Ceilings and Checkpoint Purse Law

- **32-bit value limits:** `GOLD_INT_MAX` (`2147483647`) in `src/items/itemLaw.js` mirrors signed 32-bit integer fields for `goldPieces` (`PlayerEntity.cs`), `value`, and `stackCount` (`DaggerfallUnityItem.cs`). For classic save parsing in `src/formats/saveTreeFile.js`, `CLASSIC_VALUE_MAX` (`4294967295`) bounds unsigned `getUint32` records.
- **Judge and verdict handling:** During account checkpoint evaluation, `purseWord` (`server-account/src/judge.js`) flags any purse exceeding `GOLD_INT_MAX` as an item-law finding. In `server-account/src/verdict.js`, the `clean` predicate evaluates law findings while ignoring wealth-budget findings, meaning an inflated checkpoint without law violations can still be selected as a rollback target.

## Realm Review Routes and Decor Refunds

Moderator endpoints in `server-account/src/service.js` and `server-account/src/review.js` expose `/v1/mod/realm-gains` (backed by `gainsMeasure`) and `/v1/mod/realm-trades` (backed by `tradesOf`) for command-line inspection through `tools/realmReview.mjs`. Separately, removing placed decor in `server-account/src/decor.js` refunds half of the purchase cost directly without triggering account holds.
