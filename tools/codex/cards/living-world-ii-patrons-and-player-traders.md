---
slug: living-world-ii-patrons-and-player-traders
title: "Patrons Buying from Player Traders: Valuation, Quotas, and Faucet Tracking"
domain: economy
kind: subcard
parent: living-world-ii-overview
files:
  - src/net/patronLaw.js
  - src/net/marketLaw.js
  - server-account/src/market.js
  - server-account/src/cron.js
  - server-account/src/budget.js
  - server-account/src/review.js
  - server-account/src/index.js
  - server-account/migrations/0106_patrons.sql
  - server-account/migrations/0107_trader_reads.sql
  - src/systems/livingWorld/patrons.js
  - src/systems/livingWorld/dayPlan.js
  - src/scenes/world.js
routes:
  - /v1/market/vendor
  - /v1/market/vendors
  - /v1/market/myvendors
  - /v1/mod/realm-budget
tables:
  - market_listings
  - market_patron_sales
  - realm_faucets
replacesBible:
  - "06-Systems/Living-World-II.md"
related:
  - living-world-ii-overview
  - market-vendors-and-professions
  - economy-ledger-and-item-judge
  - living-world-indoors-and-lodgers
invariants:
  - "Patron purchases execute exclusively on the account server (`reckonPatrons` in `server-account/src/market.js`, driven by the `patrons` cron job); clients only replay completed sales as resident visits."
  - "A patron pays at most `patronCap` (`Math.floor(patronWorth * PATRON_PAY_SHARE)` where `PATRON_PAY_SHARE` = `0.6`), and `patronWorth` values crafted items at their plain template base."
  - "Hourly and daily limits enforce `PATRON_TOWN_HOUR` (`4`) sales per town, `PATRON_SELLER_HOUR` (`2`) sales per seller, `PATRON_SELLER_DAY_GOLD` (`20,000` gold) per seller per day, and `PATRON_RECKON_HOURS` (`48` hours) of catch-up."
  - "Gold minted by patron sales is recorded hourly in `realm_faucets` under `FAUCET_KINDS` (`patron`) and inspected via `/v1/mod/realm-budget`."
traps:
  - "`markPatronsShut` advances `market_listings.patron_hour` while the market is closed so reopening never back-pays closed hours."
  - "`vendorBoard` read endpoints (`/v1/market/vendors` and read replicas) must never trigger patron reckoning."
  - "When the home of a chosen buyer has no resident, render generic townsperson dialogue rather than dereferencing a null resident."
dfu: []
tags:
  - patrons
  - market
  - traders
  - faucets
  - economy
---

Scheduled town residents act as server-authoritative patrons who browse player home traders, buy reasonably priced listings under strict hourly faucet caps, and walk to the vendor bench in client scenes.

## Valuation, Odds, and Cron Reckoning

In `patronLaw.js` and `marketLaw.js`, `patronTakes` rejects quest items, `patronWorth` computes plain template value, and `patronCap` caps accepted prices at `PATRON_PAY_SHARE` (`0.6`) of worth. `patronHours` counts elapsed whole hours since `market_listings.patron_hour` up to `PATRON_RECKON_HOURS` (`48`). FNV-seeded `patronCands` and `patronDraw` pick candidate listings, rolling purchase probability via `patronOdds` across `PATRON_ODDS` price-to-worth brackets (`0.5` -> `0.25`, `0.75` -> `0.12`, `1` -> `0.05`).

On the account service (`market.js`, `cron.js`, `budget.js`, `review.js`, `index.js`), `reckonPatrons` runs across `PATRON_CRON_TOWNS` (`40`) towns per pass within `PATRON_READ_STATEMENTS` (`200` D1 statements), enforcing `PATRON_TOWN_HOUR` (`4`), `PATRON_SELLER_HOUR` (`2`), and `PATRON_SELLER_DAY_GOLD` (`20,000`). Sales write to `market_patron_sales` (`0106_patrons.sql`, indexed by `idx_patron_sales_town`, `_seller`, `_region`, and `_day`, alongside `0107_trader_reads.sql`) and log minted gold to `realm_faucets` (`FAUCET_KINDS` `patron`) for `/v1/mod/realm-budget`.

## Client Visits and Browsing

Clients poll `/v1/market/vendor`, `/v1/market/vendors`, and `/v1/market/myvendors` every `PATRON_READ_S` (`600` s, retry `PATRON_RETRY_S` = `60` s) for sales within `PATRON_TOLD_S` (`86,400` s). `patrons.js` (`patronOf`, `patronVisits`) schedules buyer visits (`PATRON_STAY_MIN` = `25`, `PATRON_DELAY_DAYS` = `2`, `PATRON_OPEN_H` = `9` to `17`), while `patronErrand` (`dayPlan.js`) sends `PATRON_BROWSE_SHARE` (`0.1`) of residents to browse.
