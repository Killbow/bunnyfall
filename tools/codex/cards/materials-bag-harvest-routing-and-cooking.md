---
slug: materials-bag-harvest-routing-and-cooking
title: "Harvest and Withdrawal Routing: Bag, Pack, Over-Weight; Campfire Cooking"
domain: economy
kind: subcard
parent: materials-bag-overview
files:
  - src/professions/materialsBag.js
  - src/net/bagLaw.js
  - src/net/profBook.js
  - src/professions/gatherHost.js
  - src/systems/survival/camps.js
  - src/systems/survival/camp.js
routes:
  - /v1/prof/harvest
  - /v1/stores/withdraw
tables:
  - node_harvests
  - prof_carried
replacesBible:
  - "06-Systems/Materials-Bag.md"
related:
  - materials-bag-overview
  - professions-gathering-nodes-and-motherlodes
  - rest-arc-campfires-charges-and-dungeon-fires
invariants:
  - "`mintCarried` places each unit in the bag while the pack holds a bag and `canHoldAmount` allows it under `BAG_KG_LIMIT`, otherwise in the pack up to `entityMaxEncumbrance`."
  - "`giveCarried` mints anything left over into the pack past encumbrance (`withdrawIntoPack`), so units the service counted are never lost."
  - "`roomFor` is capped at `CARRIED_MAX` (`STORES_MAX = 5000`)."
traps:
  - "Station output larger than `WITHDRAW_MAX` (`200`) is carried out in several withdrawals by `carryOut` in `src/net/profBook.js`, each limited to `carry.room(material)`."
  - "`goodsWhere` reports what went to the bag, pack, or over-weight pack, and what was left where it was gathered."
dfu:
  - DaggerfallPotionMakerWindow.cs
tags:
  - materials-bag
  - harvest
  - encumbrance
  - campfire
  - cooking
---

# Harvest and Withdrawal Routing: Bag, Pack, Over-Weight; Campfire Cooking

When `/v1/prof/harvest` (`carry: true`) or `/v1/stores/withdraw` settles, `src/professions/materialsBag.js`, `src/net/profBook.js`, and `src/professions/gatherHost.js` route the physical items across the Materials Bag and pack without dropping server-credited units.

## Bag-First Minting and Over-Weight Fallback

`roomFor` caps carried capacity at `CARRIED_MAX` (`5000`, matching `STORES_MAX` in `src/net/bagLaw.js`). For each credited unit, `giveCarried` runs `mintCarried`:

1. **Bag first:** While the pack holds a Materials Bag and `canHoldAmount` fits the unit under `BAG_KG_LIMIT` (`300` kg), it mints into `entity.bagItems`.
2. **Pack second:** Remaining units mint into `entity.items` up to `entityMaxEncumbrance`.
3. **Over-weight pack fallback:** Any leftover counted units are placed into `entity.items` past max encumbrance via `withdrawIntoPack`, so units recorded in `prof_carried` are never lost.

`goodsWhere` reports how many units went to the bag, pack, or over-weight pack, and what was left where it was gathered. When station output exceeds `WITHDRAW_MAX` (`200`), `carryOut` (`src/net/profBook.js`) runs multiple withdrawals bounded by `carry.room(material)`. Carried harvest rows (`node_harvests.carry = 1`) are kept `CARRIED_ROW_DAYS` (`30` days) by `sweepHarvests`.

## Campfire Cooking from Pack and Bag

Campfire cooking (`src/systems/survival/camps.js` and `src/systems/survival/camp.js`, extending container ingredient lookup like `DaggerfallPotionMakerWindow.cs`) draws raw food from both containers. `openCook` lists raw food from the pack first and then from `entity.bagItems` while a bag is held. Because cooked food is not a profession material, `cookFood` always puts cooked output into the pack (`into: items`).
