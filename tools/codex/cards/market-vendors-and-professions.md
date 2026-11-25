---
slug: market-vendors-and-professions
title: Market Listings, Home Traders, and Professions
domain: economy
kind: overview
files:
  - server-account/src/market.js
  - server-account/src/professions.js
  - server-account/src/salvage.js
  - server-account/src/upgrade.js
  - server-account/src/craftWrits.js
  - src/net/craft/craftLaw.js
  - src/net/professionLaw.js
  - src/net/recipeLaw.js
routes:
  - /v1/market/read
  - /v1/market/vendor
  - /v1/prof/salvage
  - /v1/prof/upgrade
  - /v1/writs/list
  - /v1/writs/craft
tables:
  - market_listings
  - prof_stores
  - prof_carried
  - prof_carried_gate
  - prof_tracks
related:
  - account-routes-and-gate-wall
  - economy-ledger-and-item-judge
  - professions-arc-overview
invariants:
  - Market operations require `BOARD_OPEN`, `PROFESSIONS_OPEN`, and `MARKS_OPEN`, and exclude banned or held sellers via `sellerStoppedSql`.
  - "`prof_stores` (`5,000` unit cap) separates `own`, `bought`, `gold`, and `loose` units so gold-bought goods never enter Marks sales or writs."
  - Non-Focus tracks earn half XP from rank `50`, cap at Superior (`NON_FOCUS_QUALITY_MAX`), and skip rank-100 perks.
traps:
  - "`clampStatements` (`prof_carried_gate`) cuts `prof_carried` only when `seen` matches the stored total, preventing stale client counts from wiping newly credited items."
  - "`vendorBoard` caches regional vendor rows and must not run patron reckoning on read paths."
tags:
  - economy
  - market
  - vendors
  - professions
  - crafting
---

# Market Listings, Home Traders, and Professions

`server-account/src/market.js` and `server-account/src/professions.js` settle listings, orders, auctions, traders, Stores, and crafting in guarded `db.batch` writes.

- **Market and traders (`server-account/src/market.js`):** Market routes require `BOARD_OPEN`, `PROFESSIONS_OPEN`, and `MARKS_OPEN`, settling expired rows on reads (`SETTLE_MAX`) and blocking banned or held sellers (`sellerStoppedSql`). Home traders (`VENDOR_STATION`) sell pack items; `stackedListing` detects stacks, and `vendorBoard` caches regional rows without running patron reckoning on reads.
- **Stores (`server-account/src/professions.js`):** `prof_stores` (`5,000` cap) separates `own`, `bought`, `gold`, and `loose` units so gold-bought goods never enter Marks sales or writs. `clampStatements` (`prof_carried_gate`) cuts `prof_carried` only when `seen` matches the stored total.
- **Focus and craft pace (`src/net/craft/craftLaw.js`, `src/net/professionLaw.js`, `src/net/recipeLaw.js`):** Characters pledge up to two non-Provisioning `FOCUS_TRACKS` (`FOCUS_CHANGE_MARKS = 100` Marks to drop). Non-Focus tracks earn half XP from rank `50`, cap at Superior (`NON_FOCUS_QUALITY_MAX`), and skip rank-100 perks. `FIRST_MAKE_SHARE` is `0` across all tracks, replaced by per-track `CRAFT_PACE` multipliers.
- **Salvage, upgrades, and writs (`salvage.js`, `upgrade.js`, `craftWrits.js`):** `/v1/prof/salvage` breaks plain gear into `own` Stores, `/v1/prof/upgrade` spends 80% of the next metal, and `/v1/writs/craft` fills three daily writs (`/v1/writs/list`).
