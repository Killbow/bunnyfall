---
slug: home-price-service-guard
title: "Home Service Price Guard and Update Status (426)"
domain: homes
kind: subcard
parent: home-price-guard-and-refund-overview
files:
  - src/net/homeLaw.js
  - server-account/src/homes.js
  - server-account/src/halls.js
  - server-account/src/routeStatus.js
  - server-account/src/routes/townRoutes.js
  - src/net/accountClient.js
routes:
  - /v1/homes/claim
tables:
  - homes
replacesBible: []
related:
  - home-price-guard-and-refund-overview
invariants:
  - "homePriceOk(v): safe integer, within MIN..MAX, multiple of HOME_PRICE_STEP."
  - "claimHome and the hall claim return error 'home-update' for a failing price or missing layout; routeStatus maps it to HTTP 426."
traps:
  - "The service bundles no ARENA2 and cannot measure buildings; it checks range and hundreds only."
dfu: []
tags:
  - homes
  - service
  - validation
---

# Home Service Price Guard and Update Status (426)

Because the account service does not bundle `ARENA2` asset files, it cannot measure building meshes directly and instead validates submitted house prices by range, step, and layout availability across `src/net/homeLaw.js`, `server-account/src/homes.js`, and `server-account/src/halls.js`.

- **Stepped Range Validation (`src/net/homeLaw.js`, `server-account/src/homes.js`, `server-account/src/halls.js`):** `homePriceOk(v)` requires `v` to be a safe integer within `HOME_PRICE_MIN..HOME_PRICE_MAX` (`5000..250000`) that is an exact multiple of `HOME_PRICE_STEP` (`100`). Because the server checks range and hundreds divisibility rather than `ARCH3D` geometry, stale client builds that submit the classic Daggerfall radius price fail the hundreds check for almost every house.
- **Claim Refusal and HTTP 426 (`server-account/src/routeStatus.js`, `server-account/src/routes/townRoutes.js`):** Both `claimHome` on `/v1/homes/claim` and the guild hall claim path check `homePriceOk` alongside the town layout entry. When a claim submits an invalid price or lacks the required layout, the handler returns the `'home-update'` error token, and `server-account/src/routeStatus.js` maps `'home-update'` to HTTP status `426` (Upgrade Required).
- **Client Reload Prompt (`src/net/accountClient.js`):** When `src/net/accountClient.js` receives the `'home-update'` refusal from `/v1/homes/claim`, the client displays the `account.refusal.homeUpdate` notice instructing the player to reload the game client.
