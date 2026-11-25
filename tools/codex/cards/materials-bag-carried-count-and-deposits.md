---
slug: materials-bag-carried-count-and-deposits
title: "Carried Count Clamp, Seen Gate, and Stamped Batch Deposits"
domain: economy
kind: subcard
parent: materials-bag-overview
files:
  - src/net/bagLaw.js
  - src/net/profBook.js
  - src/professions/materialsBag.js
  - src/saves/save.js
  - server-account/src/profCraft.js
  - server-account/src/profToday.js
  - src/ui/profPages.js
routes:
  - /v1/stores/deposit
tables:
  - prof_carried
  - prof_carried_gate
  - prof_deposits
  - prof_stores
replacesBible:
  - "06-Systems/Materials-Bag.md"
related:
  - materials-bag-overview
  - materials-bag-loose-origin-and-station-crafting
  - market-vendors-and-professions
invariants:
  - "`clampStatements` writes a `prof_carried_gate` row only when `seen` is `null` or equals the current total; when it fires, it cuts origins in `CLAMP_ORDER` (`gold`, `bought`, `own`) down to `held` and never raises the count."
  - "`DEPOSIT_ORDERS` maps `all` to `['gold', 'bought', 'own']`, and `spend` or `work` to `['bought', 'own']`; `DEPOSIT_MAX = WITHDRAW_MAX = 200` per deposit, refusing with `carried-short` or `stores-full` (`5000`)."
  - "A repeated `rid` is answered idempotently from its `prof_deposits` row (`repeat: true`)."
traps:
  - "`depositMany` takes items via `takeCarried`, stamps each in `entity.bagTakes`, saves one checkpoint (`carry.flush`), and then posts each deposit; if the checkpoint fails, every take is rolled back (`deposit-unsaved`), while if one answer is kept, remaining deposits stay kept (`deposit-kept`) for the next settle."
  - "`heldNow` reports `max(held, seenNow)` while another carried harvest or withdrawal is pending so the service never cuts units that have not been minted yet, and `strayStamps` re-asks unsettled deposits on reload."
dfu: []
tags:
  - materials-bag
  - carried
  - deposit
  - save-stamp
  - anti-laundering
---

# Carried Count Clamp, Seen Gate, and Stamped Batch Deposits

Counted materials synchronize between client containers (`src/professions/materialsBag.js`, `src/net/profBook.js`, and `src/saves/save.js`) and D1 (`server-account/src/profToday.js` and `server-account/src/profCraft.js`) through a seen-total gate (`prof_carried_gate`) and checkpoint-stamped batch deposits (`/v1/stores/deposit`).

## Seen Gate and One-Way Clamp

`heldOf` and `heldKeysOf` count physical materials across the pack, Materials Bag, and wagon. While a carried harvest or withdrawal is pending, `heldNow` reports `max(held, seenNow)` so the server never trims newly credited units before they mint locally. On the server, `clampStatements` (`server-account/src/profToday.js`) updates `prof_carried_gate` and clamps `prof_carried` only when `seen` is `null` or matches the stored total, cutting surplus origins in `CLAMP_ORDER` (`gold`, `bought`, `own`) down to `held`.

## Deposit Orders and Stamped Batch Checkpoints

`depositStores` (`server-account/src/profCraft.js`) accepts up to `DEPOSIT_MAX` (`200`, matching `WITHDRAW_MAX`) per call and replays duplicate `rid` requests from `prof_deposits` (`repeat: true`). `DEPOSIT_ORDERS` (`src/net/bagLaw.js`) drains `prof_carried` in order:

- **`all`:** `gold`, `bought`, `own`.
- **`spend` and `work`:** `bought`, `own`.

Requests past `prof_carried` (for non-`work` orders) or `STORES_MAX` (`5000`) fail with `carried-short` or `stores-full`. The Stores town check (`inTown` in `src/ui/profPages.js`) is client-side only.

In `src/net/profBook.js`, `depositMany` takes items via `takeCarried`, stamps `entity.bagTakes` (`src/saves/save.js`), and saves one checkpoint (`carry.flush`) before calling `/v1/stores/deposit`. Failed checkpoints restore all items (`deposit-unsaved`); deferred deposits remain in `entity.bagTakes` (`deposit-kept`) for `strayStamps` to retry on settle or reload.
