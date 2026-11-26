---
slug: wagon-upkeep-tiers-overview
title: "Wagon Upkeep: Off, Boons, and Hard Tiers"
domain: world
kind: overview
parent: null
files:
  - src/systems/upkeep/upkeepTiers.js
  - src/systems/upkeep/upkeepSwitch.js
  - src/systems/upkeep/upkeepRuntime.js
  - src/travel/wagonUpkeep.js
  - src/ui/uiPrefs.js
  - src/mods/features.js
  - src/trade/tradeModes.js
  - src/mods/rriRealism.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagon-Upkeep.md"
related:
  - wagon-upkeep-wear-and-condition
  - wagon-upkeep-mending-and-repair-refusal
  - horse-care-tiers-overview
  - holdings-stable-and-transport-stabling
invariants:
  - "Prefs key `wagonUpkeep` (WAGON_UPKEEP_PREF) holds WAGON_UPKEEP_TIER_IDS ['off','boons','hard']; WAGON_UPKEEP_DEFAULT is 'boons'; WAGON_UPKEEP_STORED = { off: false, boons: 'boons', hard: 'hard' }."
  - "loadPrefs migrates a legacy stored `true` (WAGON_UPKEEP_OLD_ON) to 'hard' (WAGON_UPKEEP_OLD_ON_TIER); any other non-tier value drops to the default."
  - "`wagonUpkeepRules()` is the single accessor: null for Off and for any non-enhanced skin, read live every call."
  - "WAGON_UPKEEP_RULES: boons = { wearSlows: false, wearPrices: false, soundPace: WAGON_SOUND_BOON (1.1) }; hard = { wearSlows: true, wearPrices: true, soundPace: 1 }."
  - "A wagonUpkeep.js law handed no rules runs WAGON_UPKEEP_HARD."
  - "`saleConditionPercentage` returns 100 when `wagonSoldWhole(item, wagonUpkeepRules())` is true (Boons and Off); only Hard prices a wagon by condition."
  - "Features row is `online: 'player'`: each online player picks their own tier."
traps:
  - "Boons and Hard wear the wagon identically; only what wear costs differs. Never skip wear on Boons."
  - "Wagon item value never falls; wear changes `currentCondition` only."
  - "upkeepTiers.js is shared with horse care; keep it an import-free leaf."
  - "`shelfBandageStack` reproduces Unity's exclusive `Random.Range(1, quality / 2)`: when `quality / 2` is 1 or less (quality 2 or 3), the stack is 1, and the roll otherwise spans 1 to `max - 1` before the clamp to 8."
dfu: []
tags:
  - wagon
  - upkeep
  - tiers
  - boons
  - prefs
---

# Wagon Upkeep: Off, Boons, and Hard Tiers

Wagon upkeep runs across three player-scoped tiers (`WAGON_UPKEEP_TIER_IDS`: `'off'`, `'boons'`, and `'hard'`, defaulting to `WAGON_UPKEEP_DEFAULT = 'boons'`). `src/systems/upkeep/upkeepTiers.js` remains an import-free leaf module shared with horse care, and `src/systems/upkeep/upkeepSwitch.js` exposes `wagonUpkeepRules()` live on every call.

- **Preference storage and migration (`src/systems/upkeep/upkeepSwitch.js`, `src/ui/uiPrefs.js`, `src/mods/features.js`):** The `wagonUpkeep` (`WAGON_UPKEEP_PREF`) setting maps through `WAGON_UPKEEP_STORED` (`{ off: false, boons: 'boons', hard: 'hard' }`). In `loadPrefs`, a legacy boolean `true` (`WAGON_UPKEEP_OLD_ON`) migrates to `'hard'` (`WAGON_UPKEEP_OLD_ON_TIER`), while invalid values fall back to `'boons'`. The feature entry (`features.wagonUpkeep.*` under Features > World > Wagon upkeep) uses `online: 'player'`, so each online player selects a tier independently. `wagonUpkeepRules()` returns `null` under Off or any non-enhanced UI skin.
- **Tier behavior (`src/systems/upkeep/upkeepTiers.js`, `src/travel/wagonUpkeep.js`):** Under Off, wagons behave like classic Daggerfall Unity with no wear, normal team pace, full resale value, and yard wrights replying `"The wright has no work for you."` Boons and Hard accrue wear identically onto `currentCondition` without altering the item's base gold value, and any `wagonUpkeep.js` helper called without a rules argument defaults to `WAGON_UPKEEP_HARD`. Under Boons (`wearSlows: false`, `wearPrices: false`, `soundPace: 1.1` via `WAGON_SOUND_BOON`), a Sound wagon rolls at `1.1x` pace and wear never slows travel or discounts resale. Under Hard (`wearSlows: true`, `wearPrices: true`, `soundPace: 1`), Rickety (`0.85`) and Failing (`0.7`) states reduce travel pace.
- **Resale pricing (`src/trade/tradeModes.js`, `src/mods/rriRealism.js`):** `saleConditionPercentage` returns `100` whenever `wagonSoldWhole(item, wagonUpkeepRules())` is true (Off and Boons), so only Hard scales wagon resale prices by condition.
