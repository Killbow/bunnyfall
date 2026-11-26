---
slug: economy-ledger-and-item-judge
title: Economy Ledger, Atomic Trades, and Item Validation
domain: economy
kind: overview
files:
  - server-account/src/realmTrade.js
  - server-account/src/ledger.js
  - server-account/src/judge.js
  - server-account/src/marks.js
  - src/items/itemLaw.js
invariants:
  - "server-account/src/judge.js never discards checkpoints on validation findings; instead it applies a trade hold blocking outbound transfers."
  - "tradeRealm settles goods from stored R2 saves rather than client payloads and updates both characters, realm_trades, and ledgerMoves in one db.batch."
  - "Marks convert only into gold via /v1/marks/exchange, while unique (actor, rid) rows ensure retries return repeat: true idempotently."
  - "A batch that moves two records runs the `left` steps of both records before the `entered` steps of either, so a piece passing between them lands where it went."
traps:
  - "Claims held past DUPE_GRACE_S (750 s) lock the claimant's copy without penalizing the holder, except crafted items check products.handed_to so sellers retaining sold crafts take the lock."
  - "Reading realm_trades before verifying a character's lease and seq allows an interleaved settle to be overwritten by the next checkpoint."
  - "`leavingKeys` counts a key as leaving whenever its count falls, even when one copy remains, so a record holding two copies of a locked key cannot hand one on unlocked."
tags:
  - economy
  - trades
  - ledger
  - marks
  - validation
---

# Economy Ledger, Atomic Trades, and Item Validation

Online wealth integrity combines item validation (`src/items/itemLaw.js`), checkpoint inspection (`server-account/src/judge.js`), an item ledger (`server-account/src/ledger.js`), and atomic D1 batches.

- **Validation and holds:** `itemFindings` (`src/items/itemLaw.js`) loads headless `LAW_ONLY` rows so Workers validate items without UI imports. `server-account/src/judge.js` (`characterFindings`, `wealthOf`) never discards checkpoints; findings apply a trade hold (`held`, timed after `STRIKES_FOR_TIMED` reaches `3`) blocking outbound transfers.
- **Ledger and provenance (`server-account/src/ledger.js`):** `ledgerStep` tracks keys in `item_uids` and `item_dupes`. Claims held past `DUPE_GRACE_S` (`750` s) lock the claimant's copy without penalizing the character, except crafted items check `products.handed_to` (updated by `ledgerMoves` only from the recorded holder) so sellers retaining sold crafts take the lock.
- **Atomic trades (`server-account/src/realmTrade.js`):** `tradeRealm` (`POST /v1/realm/trade`) pairs agreeing halves (`realm_trades`) at each character's `lease` and `seq`, settles goods from stored R2 saves rather than client payloads, and advances both rows (`seq + 1`) plus `ledgerMoves` in one `db.batch`.
- **Marks and `rid` (`server-account/src/marks.js`):** Gold never buys Marks (`/v1/marks/exchange` only converts Marks to gold). Guarded `marks_ledger` inserts enforce caps, while unique `(actor, rid)` rows return `repeat: true` on retries even after switches close.
