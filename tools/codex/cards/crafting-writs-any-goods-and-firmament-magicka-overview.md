---
slug: crafting-writs-any-goods-and-firmament-magicka-overview
title: "Crafting Writs Any-Goods Acceptance and Firmament Magicka Routing"
domain: professions
kind: overview
parent: null
files:
  - server-account/src/craftWrits.js
  - server-account/src/alchemy.js
  - src/net/craftWritLaw.js
  - src/net/bagLaw.js
  - src/net/marksLaw.js
  - src/professions/craftWritHost.js
  - src/net/firmament/firmamentTree.js
  - src/characters/firmamentPowers.js
  - src/items/lootPowers.js
  - src/player/playerHeal.js
routes: []
tables:
  - prof_brews
  - prov_makes
  - products
  - prof_crafts
  - craft_writs
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-26.md"
related:
  - item-maker-identified-rare-keeps-and-curse-lift
  - professions-board-and-writs
  - materials-bag-loose-origin-and-station-crafting
  - firmament-budget-caps-and-powers
invariants:
  - "`brewedLeftSql` (`server-account/src/craftWrits.js`) sums all `prof_brews` rows plus single-trait cauldron `prov_makes` minus filled writ quantities without checking `witnessed`, and `pieceOkSql` accepts crafts where `bought_with` is not `'gold'` or `loose = 1`."
  - "`CRAFT_WRITS_PER_DAY` equals `MARKS_FAUCETS.craftWrit.perDay` (`3` per account per UTC day, enforced as `craft-writ-cap`), and `CRAFT_WRIT_PAY_MAX = 200` caps payout by trimming count first."
  - "All Firmament and jewelry magicka gains route through `manaMine` (`src/player/playerHeal.js`): Font of Magnus and Clarity (`{ mpRegen: 2, mp: 8 }`) restore `0.2%` per round via `firmamentRound`, and Soul Siphon (`{ killMana: 3 }`) restores `3%` per kill via `firmamentKill` while `firmamentAwake` is true."
traps:
  - "Court writs, Stores spending, and Masterwork eligibility still enforce `WRIT_ORIGINS = ['own', 'bought']`, and client-only temple or Dark Brotherhood potions never register in `prof_brews`."
  - "Unlike Firmament stars (which sleep offline, during `sigilDueling()`, or with `_mentor` set), `lootKill` (Wellspring) checks only `mine(me)`."
dfu: []
tags:
  - crafting-writs
  - alchemy
  - firmament
  - magicka
---

# Crafting Writs Any-Goods Acceptance and Firmament Magicka Routing

Daily crafting writs (`server-account/src/craftWrits.js`, `src/net/craftWritLaw.js`, `src/professions/craftWritHost.js` mounted in `src/scenes/world.js`) accept character-crafted potions, dishes, and kits regardless of loose input provenance, while Firmament and jewelry magicka passives (`src/characters/firmamentPowers.js`, `src/items/lootPowers.js`) route through `manaMine` (`src/player/playerHeal.js`).

## Any-Goods Crafting Writs and Daily Caps

- **SQL eligibility (`server-account/src/craftWrits.js`, `server-account/src/alchemy.js`):** `brewedLeftSql` totals all character rows in `prof_brews` plus single-trait cauldron brews in `prov_makes` minus quantities already consumed by `craft_writs`, without requiring `witnessed`. For crafted pieces (`products`, `prof_crafts`), `pieceOkSql` accepts items where `bought_with` is not `'gold'` or where `loose = 1`. Court writs, Stores spending, and Masterwork catalysts still enforce `WRIT_ORIGINS = ['own', 'bought']` (`src/net/bagLaw.js`), and client-only temple or Dark Brotherhood potions never enter `prof_brews`.
- **Faucet caps (`src/net/marksLaw.js`, `src/net/craftWritLaw.js`):** `CRAFT_WRITS_PER_DAY` matches `MARKS_FAUCETS.craftWrit.perDay` (`3` per account per UTC day under `craft-writ-cap`), and `CRAFT_WRIT_PAY_MAX = 200` trims requested count first.

## Firmament and Jewelry Magicka Routing

In `src/net/firmament/firmamentTree.js` and `src/characters/firmamentPowers.js`, Font of Magnus and Clarity (`{ mpRegen: 2, mp: 8 }`) restore `0.2%` magicka per round via `firmamentRound`, and Soul Siphon (`{ killMana: 3 }`) restores `3%` per kill via `firmamentKill` when `firmamentAwake` holds (sleeping offline, during `sigilDueling()`, or under `_mentor`). Jewelry Wellspring (`lootKill` in `src/items/lootPowers.js`) checks only `mine(me)`.
