---
slug: wagons-kinds-and-hitching-overview
title: "Wagons: Three Kinds on One Cart Template, Hitching, and Worth"
domain: travel
kind: overview
parent: null
files:
  - src/travel/wagonKinds.js
  - src/travel/horseCart.js
  - src/travel/horseCartLaw.js
  - src/items/inventorySession.js
  - src/items/itemLaw.js
  - server-account/src/judge.js
  - src/world/merchantYards/merchantYards.js
  - src/trade/tradePack.js
  - tools/bakeWagons.mjs
  - src/world/wagonModels.js
  - src/world/wagonArt.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagons.md"
related:
  - wagons-open-wagon-riders-and-seats
  - wagons-caravan-room-paint-and-visits
  - wagons-bench-team-and-harness
  - wagon-upkeep-tiers-overview
  - items-gold-counter-and-wagon
  - economy-ledger-and-item-judge
  - living-world-ii-wagon-trains-and-caravan-counters
invariants:
  - "All three kinds are DFU template 93 (TRANSPORT_SMALL_CART). An item's `wagonKind` of 'openWagon' or 'caravan' marks it; no mark means the Small Cart. No new templates are added."
  - "`activeWagonItem` drives the highest-rank wagon in the pack (cart 0, openWagon 1, caravan 2). `wagonKgFor` reads that wagon's capacity."
  - "`worthCeiling` uses the kind's `value` as the base for a marked wagon, so a Caravan is never judged against DFU's value of 150. WEALTH_VERSION = 2 in server-account/src/judge.js moved with this change."
  - "The wire carries the kind as `wk` = its index in WAGON_KIND_ORDER. An unknown code reads as 'cart'."
traps:
  - "Kind specs are WAGON_KINDS fields, not named constants. Read them through wagonHitchOf, wagonHorsesOf and wagonKgLimitOf."
  - "A loaded wagon cannot be traded, listed, vaulted or sold (wagonLoadedHeld, packTradeRefusal)."
dfu: []
tags:
  - wagons
  - caravan
  - open-wagon
  - small-cart
  - hitch
  - worth-ceiling
---

# Wagons: Three Kinds on One Cart Template, Hitching, and Worth

All three player wagons share template `93` (`TRANSPORT_SMALL_CART`, `SMALL_CART_TEMPLATE` in `src/items/inventorySession.js`). Setting `wagonKind` to `'openWagon'` or `'caravan'` upgrades the item, while an unmarked item stays the Small Cart (`SMALL_CART_KG` `750`).

- **Specs and trade locks (`src/travel/wagonKinds.js`, `src/world/merchantYards/merchantYards.js`, `src/trade/tradePack.js`):** `WAGON_KINDS` sets capacity, value, floor, hitch, horses, and seats for Small Cart (`750` kg, `150` value/floor, `3.8` m, `1` horse, `0` seats), Open Wagon (`1500` kg, `9000` value, `900` floor, `7.1` m, `2` horses, `4` seats), and Caravan (`2000` kg, `25000` value, `2500` floor, `7.7` m, `2` horses, enterable room), read via `wagonHitchOf`, `wagonHorsesOf`, and `wagonKgLimitOf`. `activeWagonItem` selects the highest-rank wagon (`cart` `0`, `openWagon` `1`, `caravan` `2`) for `wagonKgFor`. Wagon Yards mint wagons via `yardStock` and `newWagonItem`, while `wagonLoadedHeld` and `packTradeRefusal` block trading, listing, vaulting, or selling loaded wagons.
- **Worth, hitching, and meshes (`src/items/itemLaw.js`, `server-account/src/judge.js`, `src/travel/horseCart.js`, `src/travel/horseCartLaw.js`, `tools/bakeWagons.mjs`, `src/world/wagonModels.js`, `src/world/wagonArt.js`):** `worthCeiling` uses the kind `value` under `WEALTH_VERSION` `2`. Wire field `wk` carries the `WAGON_KIND_ORDER` index (unknown codes read as `'cart'`). `deploySetback` places a wagon its hitch plus `DEPLOY_CLEARANCE` (`1.0` m) behind the player (`WAGON_FOLLOW_DISTANCE` `2.5`). `tools/bakeWagons.mjs` bakes `Wagon_Cart_Tiny_1.fbx` at `SCALE` `0.45` (skipping `X` `~25`, `X` `~74`, and `Y` `>` `15`), lowering parts by `NORMAL_GROUND_OFFSET` (`1.0`) with `64x64` textures in `WAGON_ARCHIVE` (`38181`).
