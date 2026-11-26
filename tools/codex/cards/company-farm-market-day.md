---
slug: company-farm-market-day
title: "Company Farm Market Day, Stalls, and Contests"
domain: account
kind: subcard
parent: homes-camps-guilds-and-territories
files:
  - server-account/src/farmMarkets.js
  - src/net/farm/marketLaw.js
  - server-account/migrations/0219_farm_markets.sql
routes:
  - /v1/farms/market
tables:
  - farm_markets
  - farm_stalls
  - farm_market_entries
  - farm_market_awards
  - farm_market_prizes
related:
  - homes-camps-guilds-and-territories
invariants:
  - "Each stall return is gated on the claim nonce of that stall, and each judging statement on the claim nonce of that market, so two requests never pay twice."
  - "A failed judging batch is swallowed, because the claim decides which request judged the market."
traps:
  - "Stall returns and judging run on the first market request (any op but `collect`) after the market day, not on a schedule, so a farm whose market nobody opens keeps unsold stock on its stalls until someone does."
dfu: []
tags:
  - farms
  - market-day
  - contests
  - companies
---

# Company Farm Market Day, Stalls, and Contests

Every Company farm holds a market on one UTC day a week. `src/net/farm/marketLaw.js` draws the weekday from the farm map id and sets the contests, prices, and scoring. `server-account/src/farmMarkets.js` turns those answers into statements behind `/v1/farms/market`.

- **Stalls:** Members stock `MARKET_STALLS` (`4`) stalls from the Company Stores, up to `STALL_MAX` (`60`) each. Any player with a realm character can buy up to `BUY_MAX` (`10`) at a time. The gold goes to the treasury of the stocking Company, less `POT_SHARE` (a tenth) for the prize pot, and the goods go to the Stores of the buyer, in one batch.
- **Contests:** An account enters each contest once. The first market request (any op but `collect`) after the market day returns unsold stall stock to the Company that stocked it and judges the contests, each once, under the claim nonce.
- **Prizes:** Ribbons are recorded in `farm_market_awards`, and the prize gold owed to an account waits in `farm_market_prizes` until it is collected into the purse of the record.
