---
slug: "iliac-card-stake-receipts-and-face-cache"
title: "Iliac Card Stake Receipts and Face Rendering Cache"
domain: "multiplayer"
kind: "subcard"
parent: "iliac-hand-pure-engine-and-binder-saves-overview"
files:
  - "src/net/cardStakes.js"
  - "server-account/src/cards.js"
  - "server-account/src/realm.js"
  - "src/cards/cardRemoteTable.js"
  - "src/render/iliacCardFaces.js"
  - "src/ui/cardBinderPage.js"
  - "server-account/migrations/0092_card_stakes.sql"
routes: []
tables:
  - "card_stakes"
replacesBible:
  - "01-Overview/audits/Audit-Cards-5.md"
related:
  - "iliac-hand-pure-engine-and-binder-saves-overview"
  - "holdem-relay-tables-and-gold-escrow"
  - "tavern-card-tables-seating-and-physics"
invariants:
  - "`CARD_RECEIPT_DEAD` never includes `'sum'`: an unpaid sum remains on the relay word and is kept."
  - "stake() keeps a request unless the service refused it or it was never asked (stakeNeverAsked)."
  - "deleteRealm refuses with cards-held while any card_stakes row for the character is 'held'."
traps:
  - "A stake row is written 'held' and settled to 'paid' only from 'held'; repeats return the prior held order."
dfu: []
tags:
  - "stakes"
  - "gold"
  - "render"
  - "cache"
---

# Iliac Card Stake Receipts and Face Rendering Cache

Gold table escrow and client receipt persistence connect `src/net/cardStakes.js`, `src/cards/cardRemoteTable.js`, and `server-account/src/cards.js` over the `card_stakes` SQLite table (`server-account/migrations/0092_card_stakes.sql`). When a client calls `stake()`, the client stores the pending request record locally and retains it unless the account service explicitly refuses the stake or `stakeNeverAsked` confirms the request never left the client.

## Stake Settlement and Realm Deletion Guards

On the account service, a stake request writes a `card_stakes` row in the `'held'` state, and duplicate requests with the same identifier return that prior `'held'` order without double-charging. Cash-out settlement transitions a row to `'paid'` strictly from `'held'`. In `src/net/cardStakes.js`, `CARD_RECEIPT_DEAD` excludes `'sum'`, ensuring an unpaid sum stays tracked until redeemed. While any `card_stakes` row for a character remains `'held'`, `deleteRealm` in `server-account/src/realm.js` refuses character deletion with `cards-held`.

## Card Face Rendering Cache

In `src/render/iliacCardFaces.js` and `src/ui/cardBinderPage.js`, card canvases switch to compact tile layout at heights up to `ILIAC_TILE_MAX_H` (`140`) and render full detail at `LARGE_H` (`371`), caching rendered faces up to `FACE_CACHE_MAX` (`256`).
