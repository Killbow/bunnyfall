---
slug: home-price-guard-and-refund-overview
title: "Online Home Price Law, Service Guard, and Sale Refunds"
domain: homes
kind: overview
parent: null
files:
  - src/net/homeLaw.js
  - src/scenes/worldModes.js
  - server-account/src/homes.js
  - server-account/src/halls.js
  - src/net/hallLaw.js
  - src/net/realmGoldLaw.js
routes:
  - /v1/homes/claim
  - /v1/homes/town
tables:
  - homes
replacesBible:
  - "01-Overview/audits/Audit-HomePrice.md"
related:
  - economy-arc-online-home-pricing
  - homes-camps-guilds-and-territories
  - home-price-service-guard
  - living-world-relations-and-deeds
invariants:
  - "Online price = round(footprintM2 * HOME_PRICE_PER_M2 * homeTownFactor(townBlocks) / 100) * 100, clamped to HOME_PRICE_MIN..HOME_PRICE_MAX."
  - "Offline keeps the Daggerfall radius x 1280 price."
  - "homeSaleRefund(price) = trunc(price * HOME_SALE_SHARE), HOME_SALE_SHARE = 0.85 (pinned to DEED_SELL_MULT)."
  - "realmRelease pays refund + decor sale-back + uncollected rentDue."
traps:
  - "A building whose footprint cannot be measured prices 0 and is not for sale."
  - "Customs values every deed at CUSTOMS_HOUSE_PRICE (100000) x 0.85, never the online or Daggerfall price."
dfu: []
tags:
  - homes
  - economy
  - pricing
---

# Online Home Price Law, Service Guard, and Sale Refunds

Online house pricing replaces the classic radius formula with interior footprint scaling and town block factors across `src/net/homeLaw.js`, `src/scenes/worldModes.js`, and `server-account/src/homes.js`.

- **Online Price Law (`src/net/homeLaw.js`, `src/scenes/worldModes.js`):** `homeOnlinePrice` rounds `footprintM2 * HOME_PRICE_PER_M2 * homeTownFactor(townBlocks)` to `HOME_PRICE_STEP` (`100`) and clamps to `HOME_PRICE_MIN..HOME_PRICE_MAX` (`5000..250000`), with `HOME_PRICE_PER_M2 = 300`. `homeTownFactor(n)` returns `(3 + sqrt(n)) / 4` for `n` clamped to `1..HOME_TOWN_BLOCKS_MAX` (`64`). The client chain `homeOfferPrice -> homeListPrice -> homeOnlinePrice` reads the `ARCH3D` mesh box via `houseFootprintM2`. Unmeasurable footprints price at `0`, knightly-order deeds are excluded from `homeOfferPrice` at the door of the player, and offline play keeps the Daggerfall `radius * 1280` price.
- **Caps and Guild Halls (`src/net/hallLaw.js`, `server-account/src/halls.js`):** Accounts hold up to `HOME_CAP = 3` homes via `/v1/homes/claim` and `/v1/homes/town`. Guild halls cost `price + ceil(price / 2)` (`GUILD_HALL_PRICE_MULT = 1.5`, max `375000`).
- **Refunds and Customs (`server-account/src/homes.js`, `src/net/realmGoldLaw.js`):** `homeSaleRefund(price)` returns `trunc(price * HOME_SALE_SHARE)` with `HOME_SALE_SHARE = 0.85` (`DEED_SELL_MULT`). `realmRelease` pays the refund, decor sale-back, and uncollected `rentDue`. Online `deedSellPrice` computes `homeRefund(homeListPrice)` from directory `townBlocks`, offline uses `houseSellPrice`, and customs values every deed at `CUSTOMS_HOUSE_PRICE` (`100000`) times `0.85`.
