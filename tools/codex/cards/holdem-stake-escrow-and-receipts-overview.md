---
slug: holdem-stake-escrow-and-receipts-overview
title: "Hold'em Gold Stake Escrow, Receipts, and Refusals"
domain: cards
kind: overview
parent: null
files:
  - server-account/src/cards.js
  - server-account/src/realm.js
  - server/src/games/holdem.js
  - server/src/room/keys.js
  - src/net/cardStakes.js
  - src/net/cardReceipt.js
  - server-account/migrations/0092_card_stakes.sql
  - src/net/accountClient.js
routes: []
tables:
  - card_stakes
replacesBible:
  - "01-Overview/audits/Audit-Cards-4.md"
related:
  - holdem-relay-stake-void-and-table-sync
  - holdem-relay-tables-and-gold-escrow
  - tavern-cards-holdem-and-iliac-hand
invariants:
  - "Gold in = receipts + stacks + pot; no gold is created or stranded across service, relay and device."
  - "A stake asked twice (same request id) is one stake."
  - "Repeated stakes are paid from the purse in the realm act apply step."
  - "Cash-outs bank into the original staked region (card_stakes region), never a client-chosen one."
  - "deleteRealm refuses with 'cards-held' while any stake is held."
  - "Receipts pay whenever presented via single-spend row; never-brought receipts stay held."
traps:
  - "Gold tables span three parties; a fix in one must not assume the others answered."
  - "recover drops a held request only when cardStakeRefused(error) is true, not on offline/busy."
  - "Client discards a refused receipt only if its reason is in CARD_RECEIPT_DEAD; key rotation or clock drift must keep it."
  - "Receipts are acknowledged to the relay only after read-back from local storage."
dfu: []
tags:
  - holdem
  - gold
  - stakes
  - receipts
  - escrow
---

# Hold'em Gold Stake Escrow, Receipts, and Refusals

Gold-table escrow spans the account service (`server-account/src/cards.js`, `server-account/src/realm.js`, `0092_card_stakes.sql`), the room relay (`server/src/games/holdem.js`, `server/src/room/keys.js`), and the device (`src/net/cardStakes.js`, `src/net/cardReceipt.js`, `src/net/accountClient.js`) so gold in always equals receipts plus seated stacks plus pot without creating or stranding gold.

- **Service escrow and realm attribution:** The service records stakes in `card_stakes` (`status: 'held'`, with `region` and character attribution retained through cash-out). A duplicate request ID returns the single original stake, while repeated stakes deduct from the purse during the realm act apply step. Cash-outs always credit the original staked `region` in `card_stakes`, never a client-chosen region, and `deleteRealm` refuses with `'cards-held'` while any stake remains held.
- **Device recovery, receipt lifecycles, and wire refusals:** Because the three parties communicate asynchronously, `recover` drops a held request only when `cardStakeRefused(error)` matches `'cards-*'`, `'bad-*'`, or `'realm-gold'`, keeping it on offline or busy errors. Wire refusals carry a `why` reason, and a client discards a refused receipt only when its reason appears in `CARD_RECEIPT_DEAD` (retaining it across key rotation or clock drift). Presented receipts pay once via a single-spend row (unpresented receipts stay `'held'`), and the client sends a relay `ack` only after verifying read-back from local storage.
