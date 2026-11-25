---
slug: materials-bag-overview
title: "Materials Bag: Carried Materials, Stores, and the Carried Count"
domain: economy
kind: overview
parent: null
files:
  - src/net/bagLaw.js
  - src/professions/materialsBag.js
  - src/net/profBook.js
  - server-account/src/profCraft.js
  - server-account/src/profToday.js
  - server-account/src/routes/seatsRoutes.js
routes:
  - /v1/stores/deposit
  - /v1/stores/withdraw
  - /v1/prof/harvest
tables:
  - prof_carried
  - prof_deposits
  - prof_carried_gate
  - prof_stores
replacesBible:
  - "06-Systems/Materials-Bag.md"
related:
  - materials-bag-item-and-ownership
  - materials-bag-harvest-routing-and-cooking
  - materials-bag-carried-count-and-deposits
  - materials-bag-loose-origin-and-station-crafting
  - market-vendors-and-professions
  - professions-gathering-nodes-and-motherlodes
  - professions-crafting-provenance-and-master-art
invariants:
  - "Gathered units are minted as items into the Materials Bag, then the pack; they no longer go straight into Stores."
  - "The service keeps a per-character, per-material carried count (`prof_carried`, origins `own`, `bought`, and `gold`). A carried item reaches Stores, writs, market, or guild only through a deposit bounded by that count, except a station `work` deposit, which lands as `loose`."
  - "The client `held` report can only cut the count, never raise it."
traps:
  - "Stores (`STORES_MAX = 5000` per material across all origins) remain the single door for writs, the market, and guild Stores; the bag adds a carried layer in front of them rather than replacing them."
dfu: []
tags:
  - materials-bag
  - stores
  - carried
  - professions
  - economy
---

# Materials Bag: Carried Materials, Stores, and the Carried Count

The Materials Bag architecture (`src/net/bagLaw.js`, `src/professions/materialsBag.js`, `src/net/profBook.js`, `server-account/src/profCraft.js`, and `server-account/src/profToday.js`) places a physical carried-item layer in front of account-backed `prof_stores` (`STORES_MAX = 5000`).

## Physical Carry Layer and Counted Provenance

Online harvests (`/v1/prof/harvest` with `carry: true`) and withdrawals (`/v1/stores/withdraw`) no longer stay purely inside D1 Stores. Instead, the client mints physical material stacks into the Materials Bag (`BAG_TEMPLATE = 600`) or pack (`src/professions/materialsBag.js`), while the account service tracks the authoritative carried balance per character in `prof_carried` across counted origins (`own`, `bought`, and `gold`).

To enter `prof_stores` for writs, the Drakes market, or guild donations, carried items must pass through `/v1/stores/deposit` (`depositStores` in `server-account/src/profCraft.js`, recorded in `prof_deposits` via `server-account/src/routes/seatsRoutes.js`), bounded by the `prof_carried` count for that character. The only exception is a station or workshop `work` deposit (`looseOrder('work')`), which deposits uncounted pack materials into `prof_stores` under the `loose` origin without touching `prof_carried`.

## One-Way Client Clamp and Subcards

Whenever the client reports `held` counts (`heldOf` and `heldKeysOf` across pack, bag, and wagon), `clampStatements` (`server-account/src/profToday.js`, gated by `prof_carried_gate`) can only reduce `prof_carried` down to `held` and never increase it.

- `materials-bag-item-and-ownership`: template `600`, `300` kg limit, one-bag rule, and endless General Store stock.
- `materials-bag-harvest-routing-and-cooking`: bag-first minting, over-weight pack fallback, and campfire cooking.
- `materials-bag-carried-count-and-deposits`: `prof_carried_gate` clamping, `DEPOSIT_ORDERS`, and stamped batch saves.
- `materials-bag-loose-origin-and-station-crafting`: `loose` origin spending rules, station shortfalls, and market walls.
