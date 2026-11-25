---
slug: enemy-expansion-souls-and-whole-trade-lots
title: "Enemy Expansion Souls in Item Law and Whole Trade Lots"
domain: items
kind: subcard
parent: remains-gold-hud-focus-and-report-map-overview
files:
  - src/items/itemLaw.js
  - src/mods/enemyExpansion/dexIds.js
  - src/characters/enemyBasics.js
  - src/trade/tradePack.js
  - src/net/tradeSession.js
  - server-account/src/judge.js
  - server-account/migrations/0143_soul_lift.sql
routes: []
tables:
  - realm_characters
  - realm_findings
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-20h.md"
related:
  - remains-gold-hud-focus-and-report-map-overview
  - integrity-item-law-holds-and-wealth-budget
  - economy-ledger-and-item-judge
  - enemy-expansion-overview
invariants:
  - "`soulLawful` (src/items/itemLaw.js) accepts classic monsters 0-42 and classes 128-146, plus every id in `MOD_SOULS`, built from `DEX_ENEMY_IDS`. A Soul Gem or Azura's Star holding any other soul is found 'soul'."
  - "`DEX_ENEMY_IDS` is read from the mod's own tables (dexTableText, mudexTableText, dexCsv) without installing it: every id that `isClassicEnemyId` rejects, in ascending order. These are monsters 256-290 and people 384-398."
  - "`wholeLot` (src/trade/tradePack.js) returns the `validLootList` result only when every record survives, so one refused piece refuses the whole offer (\"That cannot be traded.\") and the piece stays in the pack."
traps:
  - "Whole-lot validation prevents a refused piece from leaving the giver pack at commit without riding `_mineWire` (`src/net/tradeSession.js`)."
  - "Migration 0143 lifted only the strikes and holds that soul findings alone made, and dropped its scratch tables `soul_lift` and `soul_lift_other` when done. Do not cite them as live tables."
  - "The migration comments name src/systems/... paths that no longer exist. The live files are src/items/itemLaw.js and src/mods/enemyExpansion/dexIds.js."
dfu:
  - Assets/Scripts/Game/SoulTrap.cs
  - Assets/Scripts/Game/SoulBound.cs
  - Assets/Scripts/Game/EnemyEntity.cs
  - Assets/Scripts/Game/UserInterfaceWindows/DaggerfallTradeWindow.cs
tags:
  - item-law
  - soul-gem
  - enemy-expansion
  - trade
  - holds
---

# Enemy Expansion Souls in Item Law and Whole Trade Lots

Item law and player trade validation (`src/items/itemLaw.js`, `src/mods/enemyExpansion/dexIds.js`, `src/characters/enemyBasics.js`, `server-account/src/judge.js`, `src/trade/tradePack.js`, and `src/net/tradeSession.js`) admit all 50 Daggerfall Enemy Expansion souls while enforcing all-or-nothing trade lots.

## Expansion Soul Ids and Hold Relief

In `src/items/itemLaw.js` (`JUDGE_VERSION` following `ITEM_LAW_VERSION` in `server-account/src/judge.js`), `soulLawful` accepts classic monsters `0-42`, classes `128-146` (`isClassicEnemyId` in `src/characters/enemyBasics.js`), and every id in `MOD_SOULS`, flagging any other soul inside a Soul Gem (template `274`) or Azura's Star (`artifactIndexBitfield`, `SoulTrap.cs`, `SoulBound.cs`, `EnemyEntity.cs`) with finding `'soul'`. `DEX_ENEMY_IDS` (`src/mods/enemyExpansion/dexIds.js`) reads `dexTableText`, `mudexTableText`, and `dexCsv` without a client mod install, collecting every non-classic id in ascending order: monsters `256-290` and people `384-398`. After Law 8 flagged expansion gems and triggered 7-day holds at three strikes (`STRIKES_FOR_TIMED`), Law 9 admitted `MOD_SOULS` and `server-account/migrations/0143_soul_lift.sql` lifted soul-only strikes and holds in `realm_characters` and `realm_findings`, dropping its `soul_lift` and `soul_lift_other` scratch tables.

## Whole-Lot Trade Validation

In `src/trade/tradePack.js` (`DaggerfallTradeWindow.cs`), `wholeLot` returns the `validLootList` array only when every offered record passes validation. If any piece fails (`"That cannot be traded."`), `wholeLot` rejects the whole offer so no refused item leaves the pack when `_mineWire` commits in `src/net/tradeSession.js`.
