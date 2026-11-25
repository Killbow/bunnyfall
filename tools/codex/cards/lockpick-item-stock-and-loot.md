---
slug: lockpick-item-stock-and-loot
title: "Lockpick Item: Template 584, Endless Counter Stock, Kits, and Rogue Loot"
domain: items
kind: subcard
parent: lockpicking-overview
files:
  - src/systems/lockpick/lockpickItem.js
  - src/systems/lockpick/lockpickRow.js
  - src/systems/lockpick/lockpickArt.js
  - src/trade/shopStock.js
  - src/characters/startingGear.js
  - src/saves/save.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Lockpicking.md"
related:
  - lockpicking-overview
  - market-vendors-and-professions
  - economy-ledger-and-item-judge
invariants:
  - "`isLockpick` requires `templateIndex` `584` and group `'UselessItems2'`."
  - "`lockpickRow.js` imports nothing so the account-side item law can read `LOCKPICK_LAW_ROW` headless."
  - "General Store and Pawn Shop shelf `0` always hold `ENDLESS_LOCKPICK_STACK = 25` (`ensureEndlessLockpicks`)."
  - "`restockLockpicks` refills only by what a purchase took, never past `25`, so shoplifted picks stay gone."
traps:
  - "The retroactive gift sets `lockpickGift = 1` on every older save, but only classes holding Lockpicking (primary, major, or minor) receive `LOCKPICK_KIT`."
  - "Rarity `20` prevents standard DFU shelf draws and loot tables from rolling lockpicks; enemy drops come through `registerEnemyLootExtra('lockpick')`."
dfu: []
tags:
  - lockpick
  - item-template
  - endless-stock
  - loot
  - starting-gear
---

# Lockpick Item: Template 584, Endless Counter Stock, Kits, and Rogue Loot

Lockpicks are stackable items defined in `src/systems/lockpick/lockpickRow.js`, `src/systems/lockpick/lockpickItem.js`, and `src/systems/lockpick/lockpickArt.js`, stocked in `src/trade/shopStock.js`, and granted in `src/characters/startingGear.js` and `src/saves/save.js`.

## Item Template, Headless Row, and Art

`src/systems/lockpick/lockpickRow.js` imports nothing so server item validation can read `LOCKPICK_LAW_ROW` headless. Template `LOCKPICK_TEMPLATE = 584` in group `'UselessItems2'` (`isLockpick`) specifies `baseWeight: 0.05`, `hitPoints: 100`, `basePrice: 12`, `rarity: 20`, and stackable quantity handling. At import, `src/systems/lockpick/lockpickArt.js` registers its `22 * 22` icon (`LOCKPICK_ARCHIVE = 38321`, record `0`) via `addVendorTextures`.

## Endless Shop Stock and Starting Kits

Because rarity `20` excludes template `584` from random DFU shelf draws, `ensureEndlessLockpicks` (`src/trade/shopStock.js`) seeds shelf `0` of every General Store and Pawn Shop with `ENDLESS_LOCKPICK_STACK = 25`. After a counter purchase, `restockLockpicks` refills only the bought amount up to `25`, so shoplifted picks stay depleted.

New characters receive `LOCKPICK_KIT = 5` picks from `giveStartingLockpicks` during `addSurvivalProvisions` (`src/characters/startingGear.js`). On older saves, `giveLockpickGift` in `restorePlayer` (`src/saves/save.js`) sets `lockpickGift = 1` on every save and grants `LOCKPICK_KIT` (`5`) when Lockpicking is a primary, major, or minor skill.

## Rogue Enemy Drops

`registerEnemyLootExtra('lockpick')` rolls `ROGUE_LOCKPICKS` (`[type, chance, max]`, uniform `1..max` count):

- **Burglar and Thief:** `0.6` chance, `1..3` picks.
- **Rogue:** `0.3` chance, `1..2` picks.
- **Nightblade, Acrobat, and Assassin:** `0.25` chance, `1..2` picks.
- **Bard:** `0.15` chance, `1` pick.
