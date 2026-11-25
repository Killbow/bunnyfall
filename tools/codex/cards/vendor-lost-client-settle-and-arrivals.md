---
slug: vendor-lost-client-settle-and-arrivals
title: "Home Vendor Stall-Open Settle, Landed Asks, and Arrivals Sweep"
domain: economy
kind: subcard
parent: vendor-lost-landed-repeat-overview
files:
  - src/net/marketBook.js
  - src/trade/vendorHost.js
  - src/ui/vendorTab.js
  - src/net/marketArrivals.js
  - src/saves/realmSaves.js
  - src/justice/court.js
  - src/scenes/world.js
routes: []
tables:
  - market_sales
  - market_deliveries
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25g.md"
related:
  - vendor-lost-landed-repeat-overview
  - host-split-extracted-modules
  - host-move-tooling-and-handle-semantics
invariants:
  - "`src/net/marketBook.js` sends `landed: true` on buy and collect requests, counting a repeat response as the caller own sale only when `realm.seq` is returned."
  - "`openHomeVendorWindow` in `createVendorHost` (`src/trade/vendorHost.js`) wires `settle` to `arrivals.sweep()` (`src/net/marketArrivals.js`) so opening any home stall collects pending buys and arrived deliveries."
  - "`vendorBuy` (`src/ui/vendorTab.js`) reports the item as on its way (`vendor.buy.onWay`) until delivery settles."
traps:
  - "Home-trader logic lives in `src/trade/vendorHost.js` rather than inline in `bootWorld` (`src/scenes/world.js`)."
dfu: []
tags:
  - market
  - vendors
  - arrivals
  - host-split
---

# Home Vendor Stall-Open Settle, Landed Asks, and Arrivals Sweep

`src/net/marketBook.js`, `src/trade/vendorHost.js`, `src/ui/vendorTab.js`, and `src/net/marketArrivals.js` coordinate client-side retry flags and stall-open delivery sweeps for home-trader purchases across `market_sales` and `market_deliveries`.

## Landed Requests and Delivery Feedback

- **Client landed asks (`src/net/marketBook.js`, `src/saves/realmSaves.js`, `src/justice/court.js`):** Buy and collect calls in `src/net/marketBook.js` attach `landed: true` to their request payloads and treat a repeated response as the caller purchase only when the server reply includes `realm.seq`.
- **In-flight purchase notice (`src/ui/vendorTab.js`):** If a purchase lands while its delivery collection is still pending, `vendorBuy` displays `vendor.buy.onWay` to report that the item is on its way until delivery settlement finishes.

## Stall-Open Arrivals Sweep

- **Host wiring (`src/trade/vendorHost.js`, `src/net/marketArrivals.js`, `src/scenes/world.js`):** Home-trader window orchestration lives in `createVendorHost` (`src/trade/vendorHost.js`), extracted from `bootWorld` (`src/scenes/world.js`). When a player opens a stall, `openHomeVendorWindow` passes `settle` wired to `arrivals.sweep()` (`src/net/marketArrivals.js`), recovering uncollected `market_deliveries` rows without requiring the player to open the Market tab first.
