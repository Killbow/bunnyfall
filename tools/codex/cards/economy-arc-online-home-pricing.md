---
slug: economy-arc-online-home-pricing
title: "Online Home, Guild Hall, and Deed Pricing"
domain: economy
kind: subcard
parent: economy-arc-overview
files:
  - src/net/homeLaw.js
  - src/net/hallLaw.js
  - src/homes/onlineHomes.js
  - src/scenes/worldModes.js
  - src/trade/banking.js
  - src/net/realmGoldLaw.js
  - server-account/src/homes.js
  - server-account/src/halls.js
  - server-account/src/routes/townRoutes.js
  - server-account/migrations/0010_homes.sql
routes:
  - /v1/homes/claim
  - /v1/homes/release
  - /v1/homes/deed
  - /v1/guilds/hall/buy
  - /v1/guilds/hall/sell
tables:
  - homes
replacesBible:
  - "06-Systems/Economy-Arc.md"
related:
  - economy-arc-overview
  - homes-camps-guilds-and-territories
  - arena-city-block-and-home-relocation
  - realm-arc-gold-law-empire-and-vendor-ceiling
invariants:
  - "`homeOnlinePrice = clamp(round(m2 * HOME_PRICE_PER_M2 * homeTownFactor(blocks) / 100) * 100, 5_000, 250_000)`, where `homeTownFactor = (3 + sqrt(blocks)) / 4` and blocks is clamped to 1..64."
  - "The service cannot measure buildings, so `claimHome` and `buyHall` accept any client price that passes `homePriceOk` (a safe integer from 5,000 to 250,000 in steps of 100) and otherwise return the `home-update` error."
  - "`guildHallPrice(p) = p + ceil(p / 2)`, which is 1.5 times the price and at most 375,000."
  - "`realmRelease` pays `homeSaleRefund(paid)` (`HOME_SALE_SHARE = 0.85` of the recorded `paid`), plus `rent_due`, plus `decorBack`."
traps:
  - "A `homes` row whose `paid` is 0 is HOME-CROSSED: it sells back as a house, never as gold."
  - "The `homes` primary key (`map_id`, `building_key`) enforces a single online owner per building."
  - "Offline, the deed buy-back keeps DFU's radius price. Online, `deedSellPrice` pays 0.85 of the online price. Customs uses `CUSTOMS_HOUSE_PRICE`."
dfu: []
tags:
  - homes
  - guild-hall
  - home-price
  - deed
  - refund
---

# Online Home, Guild Hall, and Deed Pricing

Online real estate scales prices by interior area and town block count within bounded limits, while server routes validate stepped price bands and record ownership in the `homes` table (`src/net/homeLaw.js`, `src/net/hallLaw.js`, `server-account/src/homes.js`).

## Footprint Pricing and Server Validation

- **Home and hall formulas (`src/net/homeLaw.js`, `src/net/hallLaw.js`, `src/homes/onlineHomes.js`):** `homeOnlinePrice` computes `clamp(round(m2 * HOME_PRICE_PER_M2 * homeTownFactor(blocks) / 100) * 100, 5_000, 250_000)`, where `homeTownFactor(blocks) = (3 + sqrt(blocks)) / 4` for `blocks` clamped to `1..64` (buildings over about `303` m2 in large towns reach `250,000`). `guildHallPrice(p)` adds `ceil(p / 2)` (`1.5 * p`, up to `375,000`).
- **Claims and limits (`server-account/src/homes.js`, `server-account/src/halls.js`, `server-account/migrations/0010_homes.sql`):** Because the account server lacks building geometry, `claimHome` (`/v1/homes/claim`) and `buyHall` (`/v1/guilds/hall/buy`) check `homePriceOk` (an integer in `5,000..250,000` divisible by `100`), returning `home-update` on failure. The `homes` primary key `(map_id, building_key)` ensures one owner per building, capped at `HOME_CAP = 3` and `HOME_CLAIMS_MAX = 20` per `HOME_CLAIMS_WINDOW_S = 3600`.

## Releases, Refunds, and Deeds

- **Release payouts (`server-account/src/homes.js`, `src/trade/banking.js`, `src/net/realmGoldLaw.js`):** On `/v1/homes/release` (and `/v1/guilds/hall/sell`), `realmRelease` refunds `homeSaleRefund(paid)` (`HOME_SALE_SHARE = 0.85` of recorded `paid`), plus `rent_due` and `decorBack`. Rows with `paid = 0` (`HOME-CROSSED`) return a house deed (`/v1/homes/deed`) rather than gold. Online `deedSellPrice` pays `0.85` of the online price, offline keeps the DFU radius price, and customs uses `CUSTOMS_HOUSE_PRICE`.
