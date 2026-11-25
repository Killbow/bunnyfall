---
slug: realm-arc-service-transactions-and-escrow
title: "Service-Side Hand-Overs: Trade Escrow, Treasury, Homes, and Decor"
domain: economy
kind: subcard
parent: realm-arc-overview
files:
  - src/saves/realmSaves.js
  - src/net/tradeSession.js
  - server-account/src/realm.js
  - server-account/src/realmTrade.js
  - server-account/src/guilds.js
  - server-account/src/homes.js
  - server-account/src/decor.js
  - src/net/decorLaw.js
routes:
  - /v1/realm/trade
tables:
  - realm_trades
  - realm_tx_guard
  - realm_characters
  - guilds
  - homes
  - home_decor
replacesBible:
  - "06-Systems/Realm-Arc.md"
related:
  - realm-arc-overview
  - economy-ledger-and-item-judge
  - homes-camps-guilds-and-territories
invariants:
  - "Every realm hand-over rewrites the stored save through `prepareRealmRecord` and commits in one D1 batch guarded by `mustChange`, which inserts into `realm_tx_guard` (failing the batch) when `changes()` differs from expected."
  - "`realmTradeEscrow` checkpoints first, submits the half, and lets only the service answer end the trade; the client restores nothing itself while `_settling`."
  - "Escrow trades start at `REALM_TRADE_REV_BASE` (`TRADE_REV_MAX / 2`), so an older build peer is refused (`OLDER_BUILD_TRADE_TEXT`)."
  - "Guild treasury (`realmTreasury`, `foundGuild`), homes (`realmClaim`, `realmRelease`), and decor (`realmDecorWrite`, `decorGoldDelta`) move gold through the service, never through the client save alone."
traps:
  - "`realmGoldAct` must checkpoint before reserving; an act sent from a stale sequence is refused and the client must not apply it locally."
  - "`realmSideOf(character, realm)` decides which side of a realm or offline split a row belongs to; mixing sides in one act breaks the trust boundary."
dfu: []
tags:
  - escrow
  - transactions
  - treasury
  - homes
  - atomicity
---

# Service-Side Hand-Overs: Trade Escrow, Treasury, Homes, and Decor

Whenever online gold or items cross between characters or shared tables, the account service mutates the authoritative R2 save via `prepareRealmRecord` (`server-account/src/realm.js`) and commits the D1 state change atomically.

## Atomic D1 Guard and Pre-Act Checkpoints

- **Batch guard (`server-account/src/realm.js`):** Every service mutation appends `mustChange(db, n)` to its D1 batch. If the preceding statement's `changes()` count differs from `n`, `mustChange` inserts into `realm_tx_guard` to abort the entire batch.
- **Client reservation (`src/saves/realmSaves.js`):** `realmGoldAct` checkpoints the active save before sending any gold-moving request so the service always operates on the latest sequence, while `realmSideOf(character, realm)` keeps online realm rows strictly separated from offline records.

## Escrow Trades, Guild Treasury, Homes, and Decor

- **Two-half trade escrow (`src/net/tradeSession.js`, `server-account/src/realmTrade.js`):** Escrow trades begin at `REALM_TRADE_REV_BASE` (`TRADE_REV_MAX / 2`), rejecting peers on older builds with `OLDER_BUILD_TRADE_TEXT`. `realmTradeEscrow` checkpoints first and submits the character's half to `POST /v1/realm/trade`, where `realm_trades` rows (`state` defaulting to `'waiting'`) pair `a_lease`/`a_seq` with `b_seq`. While `_settling`, the client never restores items locally; only the service response finalizes the hand-over.
- **Treasury, homes, and decor (`server-account/src/guilds.js`, `server-account/src/homes.js`, `server-account/src/decor.js`, `src/net/decorLaw.js`):** Guild founding and treasury transfers (`foundGuild`, `realmTreasury` on `guilds`), home purchases and releases (`realmClaim`, `realmRelease` on `homes`), and furnishing edits (`realmDecorWrite` on `home_decor`, priced by `decorGoldDelta` from `decorGoldMove`) all settle gold directly inside the stored realm save.
