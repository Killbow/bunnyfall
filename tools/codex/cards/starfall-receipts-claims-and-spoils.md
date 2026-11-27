---
slug: starfall-receipts-claims-and-spoils
title: "Starfall Receipts, Account Claims, and Spoils"
domain: multiplayer
kind: subcard
parent: starfall-overview
files:
  - src/net/starfall/starReceipt.js
  - src/net/starfall/starClaims.js
  - server-account/src/stars.js
  - server-account/src/index.js
  - server-account/migrations/0141_stars_held.sql
  - src/systems/starfall/starSpoils.js
  - src/systems/starfall/starglass.js
  - src/systems/starfall/starRewards.js
  - src/net/accountClient.js
routes:
  - /v1/star/claim
tables:
  - stars_held
  - star_spoils
replacesBible:
  - "11-Multiplayer/Starfall.md"
related:
  - starfall-overview
  - starfall-relay-cells-and-version-floors
  - world-events-and-signed-receipts
  - questlines-service-claims-titles-and-weir-key
  - economy-ledger-and-item-judge
invariants:
  - "When a star reaches `held`, the relay mints a 7-day (`STAR_RECEIPT_TTL_S`) Ed25519 `j1` receipt (`STAR_RECEIPT_V`) for every `starEarned` account that landed at least one blow and was present within `STAR_PRESENT_MS` of completion."
  - "`claimStar` enforces a `(star, account)` primary key in `stars_held` and caps claims at `STAR_CLAIMS_DAY_MAX` (9) per UTC day of the star's impact (`starDayOf`), not the UTC day of the claim request."
  - "Each verified claim executes one D1 batch writing `stars_held`, Renown, and silver under the daily combat cap; retried claims resolve as `claimed` and recover character attribution through `cid`."
traps:
  - "Unregistered guest sessions roll local `star_spoils` once per device but never write rows to `stars_held`."
  - "Claim rejections return `no-gate-key`, `receipt` (with `why`), `not-yours`, or `renown-character`, and the client queue retries only `STAR_CLAIM_MENDABLE` failure reasons."
  - "The item is named Starfall Glass, never Starglass, because Starglass is already the name of a naval trade good (template `1340` in `tradeGoods.js`)."
dfu: []
tags:
  - starfall
  - receipts
  - ed25519
  - account-service
  - loot
  - renown
---

# Starfall Receipts, Account Claims, and Spoils

When a star is held, the cell relay checks `starEarned` and mints a signed `j1` receipt (`STAR_RECEIPT_V` in `src/net/starfall/starReceipt.js`, valid for `STAR_RECEIPT_TTL_S` or `7` days) for each defender who struck an enemy and reported near the crater within `STAR_PRESENT_MS` (`15` s) of victory. The client queues the receipt in `src/net/starfall/starClaims.js` and submits it to `/v1/star/claim` via `src/net/accountClient.js`.

## Account Settlement, Daily Caps, and Spoils Rolls

- **D1 settlement (`server-account/src/stars.js`, `server-account/migrations/0141_stars_held.sql`):** `claimStar` verifies the `j1` signature against `GATE_SIGNING_KEY`, checks that the receipt belongs to the authenticated account (`not-yours`), and enforces `STAR_CLAIMS_DAY_MAX` (`9` stars) grouped by the star's impact day (`starDayOf`), not the submission timestamp. A single D1 batch inserts the `(star, account)` row into `stars_held`, grants Renown to `cid`, and credits silver under the daily combat cap.
- **Idempotent retries and questline witnesses:** Duplicate submissions return `claimed` and match `cid` so interrupted connections still trigger local reward delivery. Questline witnesses (`star` and `stars3` in `QL_WITNESS_SQL`) query `stars_held` directly. Guest players skip `/v1/star/claim` and record local device rewards in `star_spoils`.
- **Spoils and Starfall Glass (`src/systems/starfall/starSpoils.js`, `src/systems/starfall/starglass.js`, `src/systems/starfall/starRewards.js`):** Every held star grants `STAR_SPOILS_GOLD_PER_LEVEL` (`60` gold per character level), `1` to `STARGLASS_MAX` (`3`) Starfall Glass reagents, one identified Magic-or-higher item, and a roll for Starspun Weave gear. Holding a Heart-Star doubles the gold and Starfall Glass rolls and guarantees a Starspun piece.
