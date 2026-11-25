---
slug: peer-word-letters-and-worn-offers-overview
title: "Peer-Word Limits, Letters of Credit, and Worn-Only Offers"
domain: economy
kind: overview
parent: null
files:
  - src/net/peerWord.js
  - src/items/loot.js
  - src/items/itemLaw.js
  - server-account/src/judge.js
  - server-account/src/review.js
  - server-account/src/verdict.js
  - server-account/src/service.js
  - src/items/bodyLootHost.js
  - src/items/roomLootHost.js
  - src/world/interiorShared.js
  - src/world/interiorRoomLoot.js
  - src/net/bodyLoot.js
  - src/characters/exteriorFoes.js
  - src/scenes/dungeonContext.js
  - src/scenes/exterior.js
  - src/platform/onlineLane.js
  - src/net/realmTradeLaw.js
  - src/world/wild/wildDropLaw.js
  - src/characters/equip.js
  - src/scenes/world.js
  - src/ui/nativeInventory.js
  - src/net/wire.js
routes:
  - /v1/mod/realm-gains
  - /v1/mod/realm-trades
tables:
  - item_uids
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12f.md"
related:
  - gold-int-caps-and-realm-review-routes
  - economy-ledger-and-item-judge
  - integrity-item-law-holds-and-wealth-budget
  - market-vendors-and-professions
invariants:
  - "A peer's word never carries a letter of credit or bound item (peerHanded)."
  - "A peer's item price is clamped to worthCeiling (loot.js lawPriced)."
  - "Purse, item value and stack counts never exceed GOLD_INT_MAX."
  - "isLetterOfCredit/neverPeerHanded/peerHanded strip letters from incoming and outgoing wire lists (lootRecords, interiorLootRecords, enemy heirs)."
  - "Online (isOnlinePage), letterRefusesPut refuses a letter into non-owned containers; letterPutText explains; owned storage and offline are allowed."
  - "setItemLaw(itemFindings, worthCeiling) registers the ceiling; VALUE_IS_IDENTITY_TEMPLATES, BOAT_TEMPLATES and letters are identity-valued and exempt."
  - "wildBodyArrived offers pass through wornOffer (equipped, losable, capped) using wearableItem."
traps:
  - "Coin piles on peer word stay allowed (party loot); budget is measured, not enforced."
  - "grantCorpse (bodyLootHost.js) must order non-peer-handed items last so front-count reservation does not truncate."
  - "Letters already in room containers are dropped: rooms track no depositor and expire after WORLD_TTL_MS."
  - "scenes/exterior.js is intentionally unwired (offline fixed cities)."
dfu:
  - DaggerfallUnityItem.cs
  - PlayerEntity.cs
tags:
  - hacked-gold
  - peer-word
  - integrity
  - letter-of-credit
  - price-cap
  - worn-offer
---

# Peer-Word Limits, Letters of Credit, and Worn-Only Offers

Peer-word loot filtering, letter-of-credit transfer boundaries, item price ceilings, and worn-only corpse offers are enforced across `src/net/peerWord.js`, `src/items/loot.js`, `src/items/itemLaw.js`, and the shared loot hosts (`src/items/bodyLootHost.js`, `src/items/roomLootHost.js`, `src/world/interiorRoomLoot.js`, and `src/net/bodyLoot.js`).

## Letters of Credit and Container Rules

- **Wire filtering:** `isLetterOfCredit`, `neverPeerHanded`, and `peerHanded` (`src/net/peerWord.js`) strip letters of credit and bound items from incoming and outgoing wire lists (`lootRecords`, `interiorLootRecords`, and enemy heirs in `src/characters/exteriorFoes.js` and `src/scenes/dungeonContext.js`). `grantCorpse` (`src/items/bodyLootHost.js`) orders non-peer-handed items last so front-count reservation never truncates valid drops.
- **Container and trade boundaries:** When `isOnlinePage` (`src/platform/onlineLane.js`) is active, `letterRefusesPut` blocks putting a letter into non-owned containers and displays `letterPutText`, while owned storage and offline play remain permitted. Letters found in room containers are dropped because rooms record no depositor and expire after `WORLD_TTL_MS`. Letters move between players only through settled realm trades (`src/net/realmTradeLaw.js`).

## Price Ceilings and Worn-Only Offers

`setItemLaw(itemFindings, worthCeiling)` registers the valuation ceiling so `lawPriced` (`src/items/loot.js`) clamps peer item prices to `worthCeiling`, exempting identity-valued templates (`VALUE_IS_IDENTITY_TEMPLATES`, `BOAT_TEMPLATES`, and letters). For `wildBodyArrived`, `wornOffer` (`src/world/wild/wildDropLaw.js`) restricts offers to equipped, losable, capped items via `wearableItem` (`src/characters/equip.js`).
