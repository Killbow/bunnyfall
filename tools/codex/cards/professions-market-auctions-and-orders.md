---
slug: professions-market-auctions-and-orders
title: "Marks Market Listings, Buy Orders, Couriers, and Masterwork Auctions"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/marketLaw.js
  - src/net/marketBook.js
  - src/ui/marketTab.js
  - src/ui/packPicker.js
  - server-account/src/market.js
routes:
  - /v1/market/read
  - /v1/market/list
  - /v1/market/buy
  - /v1/market/cancel
  - /v1/market/order
  - /v1/market/fill
  - /v1/market/unorder
  - /v1/market/collect
  - /v1/market/report
  - /v1/market/remove
  - /v1/market/auction
  - /v1/market/bid
tables:
  - market_listings
  - market_sales
  - market_deliveries
  - market_orders
  - market_fills
  - market_prices
  - market_reports
  - market_auctions
  - market_bids
  - market_auction_reports
  - products
replacesBible:
  - "06-Systems/Professions-Arc.md"
related:
  - professions-arc-overview
  - market-vendors-and-professions
  - economy-ledger-and-item-judge
  - professions-crafting-provenance-and-master-art
invariants:
  - "`MARKET_LISTINGS_MAX` allows 30 active listings per account for `MARKET_LISTING_S` (72 h), and `MARKET_ORDERS_MAX` allows 20 buy orders for `MARKET_ORDER_S` (7 days)."
  - "Prices run from 1 to `MARKET_PRICE_MAX` (1,000,000); `listingFee` charges `max(1, ceil(worth / 100))`, and `MARKET_TAX_PCT` takes 5% on settlement."
  - "`MARKET_POSTS_MAX` (60) and `MARKET_OPS_MAX` (120) bound market mutations per `MARKET_WINDOW_S` (3,600 s)."
  - "Auctions accept only Masterwork items (`auctionable`), run for `AUCTION_S` (24 h), require a 5% bid raise (minimum 1 Mark), and extend by `AUCTION_ADD_S` (120 s) when bid within the final `AUCTION_LATE_S` (120 s)."
  - "Rows that answer a repeat are pruned after 90 days but the Marks ledger is permanent, so each market decision also refuses a request id whose first ledger line already exists."
traps:
  - "When a winning auction settles while the seller sits at `MARKS_MAX`, payout holds for `AUCTION_GRACE_S` (7 days) before voiding the bid and returning the item unsold."
  - "`MARKET_TITHE_PCT` defaults to 0 in `src/net/marketLaw.js`; live regional tithes are read dynamically from the seat holder via `titheAt` in `seatHolding.js`."
tags:
  - market
  - auctions
  - buy-orders
  - courier
  - gold-market
---

`src/net/marketLaw.js`, `src/net/marketBook.js`, `src/ui/marketTab.js`, `src/ui/packPicker.js`, and `server-account/src/market.js` implement the Marks commodity exchange, regional couriers, and Masterwork auctions.

## Listings, Buy Orders, and Rate Bounds

`/v1/market/read` paginates up to `MARKET_SHOWN` (100) rows per view across `MARKET_PAGES_MAX` (500) pages and records history in `market_prices`. Accounts post up to `MARKET_LISTINGS_MAX` (30) sell listings (`/v1/market/list`, `/v1/market/buy`, and `/v1/market/cancel` on `market_listings` and `market_sales`) for `MARKET_LISTING_S` (72 h), and up to `MARKET_ORDERS_MAX` (20) escrowed buy orders (`/v1/market/order`, `/v1/market/fill`, and `/v1/market/unorder` on `market_orders` and `market_fills`) for `MARKET_ORDER_S` (7 days). Lot sizes cap at `MARKET_UNITS_MAX` (`STORES_MAX`), prices run 1 to `MARKET_PRICE_MAX` (1,000,000), and order worth caps at `MARKET_WORTH_MAX` (`MARKS_MAX`). Posting charges `listingFee` (`max(1, ceil(worth / 100))`), and sales deduct `MARKET_TAX_PCT` (5%) plus any seat tithe (`MARKET_TITHE_PCT` defaults to 0, read from `titheAt` in `seatHolding.js`). Activity caps at `MARKET_POSTS_MAX` (60) and `MARKET_OPS_MAX` (120) per `MARKET_WINDOW_S` (3,600 s).

## Couriers and Masterwork Auctions

Cross-town purchases queue in `market_deliveries` for `/v1/market/collect`. `COURIER` hauls 20 units per trip at 25 map pixels per Mark (2-Mark minimum), taking a 900 s base plus 10 pixels per minute.

`/v1/market/auction` and `/v1/market/bid` (`market_auctions`, `market_bids`, and `products`) admit only Masterwork pieces (`auctionable`) for `AUCTION_S` (24 h). Bids raise by at least 5% (1-Mark floor) and add `AUCTION_ADD_S` (120 s) during the final `AUCTION_LATE_S` (120 s). Sellers at `MARKS_MAX` have `AUCTION_GRACE_S` (7 days) before the bid voids. `/v1/market/report` and `/v1/market/remove` write to `market_reports` and `market_auction_reports`.
