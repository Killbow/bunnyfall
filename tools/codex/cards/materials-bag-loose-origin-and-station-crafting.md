---
slug: materials-bag-loose-origin-and-station-crafting
title: "Loose Origin: Crafting from Uncounted Pack Materials"
domain: economy
kind: subcard
parent: materials-bag-overview
files:
  - src/net/bagLaw.js
  - src/net/profBook.js
  - src/ui/profPages.js
  - server-account/src/profCraft.js
  - server-account/src/profSpend.js
  - server-account/src/alchemy.js
  - server-account/src/masterWork.js
routes:
  - /v1/stores/deposit
  - /v1/prof/craft
  - /v1/prof/smelt
  - /v1/prof/brew
tables:
  - prof_stores
  - prof_deposits
  - prof_withdrawals
  - prof_smelts
  - products
replacesBible:
  - "06-Systems/Materials-Bag.md"
related:
  - materials-bag-carried-count-and-deposits
  - professions-crafting-provenance-and-master-art
  - economy-ledger-and-item-judge
invariants:
  - "`LOOSE_ORIGIN` is `'loose'`. Only `looseOrder('work')` deposits may move units beyond the carried count, and those land as `loose` without touching `prof_carried`."
  - "`STATION_ORIGINS` spends in the order `loose`, `bought`, `own`. `WRIT_ORIGINS` (`own`, `bought`) is what writs, guild Stores, and the Drakes market read, so `loose` and `gold` are never spent there."
  - "Products made from `loose` inputs are flagged `loose` (`bought_with = 'gold'`) in `server-account/src/profCraft.js`, which walls them off from Drakes listings, commissions, auctions, and writs."
traps:
  - "`ensureInStores(inputs, { work: true })` checks every shortfall against `carriedWorkable` before moving anything, then sends them all through one `depositMany`; a later refusal leaves earlier inputs in Stores, and `movedFirstText` informs the player."
  - "The Stores page splits Put in into counted units (`all`) and the uncounted remainder (`work`), overriding the stale `looseOrder` comment."
dfu: []
tags:
  - materials-bag
  - loose-origin
  - crafting
  - writs
  - gold-market
---

# Loose Origin: Crafting from Uncounted Pack Materials

The `loose` origin (`LOOSE_ORIGIN = 'loose'` in `src/net/bagLaw.js`, tracked across `prof_stores`, `prof_deposits`, `prof_withdrawals`, `prof_smelts`, and `products`) lets characters craft, smelt, and brew (`/v1/prof/craft`, `/v1/prof/smelt`, and `/v1/prof/brew`) with uncounted pack materials while isolating those goods from Marks and Drakes player markets.

## Work Deposits and the Stores Page Split

Only a deposit with order `'work'` (`looseOrder('work')`) can move physical units beyond the `prof_carried` balance for that character (`/v1/stores/deposit` in `server-account/src/profCraft.js`). Any units above the available `'bought'` and `'own'` carried counts land in `prof_stores` under `'loose'` without decrementing `prof_carried`.

On the Stores page (`src/ui/profPages.js`), clicking Put in splits held items into counted units (sent with order `'all'`) and any uncounted remainder (sent with order `'work'`), displaying `LOOSE_GOODS_LINE` on stored loose balances.

## Station Spending Order and Provenance Wall

In `src/net/profBook.js`, `workable(material)` sums `storesWorkable` and `carriedWorkable`. Before a station action runs, `ensureInStores(inputs, { work: true })` verifies every shortfall against `carriedWorkable` and batches all needed transfers through one `depositMany` call; if a later step fails after deposits succeed, `movedFirstText` informs the player that inputs were moved into Stores first.

`server-account/src/profSpend.js`, `server-account/src/alchemy.js`, and `server-account/src/masterWork.js` enforce origin walls:

- **Station crafting (`STATION_ORIGINS`):** Spends `loose`, then `bought`, then `own`. Any output crafted or smelted from `loose` inputs is stamped `loose` (`bought_with = 'gold'`) in `products` (`server-account/src/profCraft.js`).
- **Market and writs (`WRIT_ORIGINS`):** Writs, guild Stores, commissions, auctions, Drakes listings, and Master-Art catalysts read only `own` and `bought`, excluding both `loose` and `gold` materials and products.
