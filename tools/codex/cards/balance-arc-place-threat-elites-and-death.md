---
slug: balance-arc-place-threat-elites-and-death
title: "Place Threat, Offline Elites, and Death Toll"
domain: combat
kind: subcard
parent: balance-arc-overview
files:
  - src/characters/skillSoftcap.js
  - src/items/lootRarity.js
  - src/scenes/dungeonContext.js
  - src/characters/exteriorFoes.js
  - src/characters/enemyEntity.js
  - src/characters/heroThreat.js
  - src/characters/eliteFoes.js
  - src/items/searchables.js
  - src/ui/uiPrefs.js
  - src/mods/features.js
  - src/player/deathPenalty.js
  - src/scenes/world.js
  - src/net/foeBounds.js
replacesBible:
  - "05-Combat/Balance-Arc.md"
related:
  - balance-arc-overview
  - enemy-ai-navmesh-and-combat-tactics
  - world-modes-and-transitions
invariants:
  - "`PLACE_THREAT` (`{ from: 4, full: 18, wilderness: { day: 5, night: 7 } }`) drives `placeVeteran(tier) = clamp01((tier - 4) / 14)` in `src/characters/skillSoftcap.js`."
  - "Dungeon threat tier comes from `DUNGEON_RARITY_TIER` by `dungeonType`; place scaling evaluates to `0` unless `lootRarityOn()` is true and is always `0` for allies, gate arenas, arena floors, and the Shattered Hour realm."
  - "Exterior place scaling applies only to non-allied enemies spawned outside locations (`inLocation === false`) via `wildernessThreat(isNight)`."
  - "`elitesAllowed` (`src/characters/eliteFoes.js`) is true in an online page or room and otherwise delegates to `lootRarityOn()`; `rollSearchElite` (`src/items/searchables.js`) requires the same gate."
  - "The `enhancedAI` preference defaults to `true` (`src/mods/features.js`), and `PREF1_ADOPT_NEW_DEFAULT` (`src/ui/uiPrefs.js`) enables both `lootRarity` and `enhancedAI` on unstamped preferences."
  - "`deathGoldLoss` (`src/player/deathPenalty.js`) computes `Math.floor(gold / DEATH_GOLD_DIVISOR)` (`DEATH_GOLD_DIVISOR = 10`), and respawn deducts the cached `stateDeathLoss` value capped at the player's current purse."
traps:
  - "Spawn sites (`applyProgressionScalingTo` in `src/scenes/dungeonContext.js` and `src/characters/exteriorFoes.js`) call `progressionScaling(null, 0, share, place, null)`, bypassing the Master Skills veteran layer and `heroThreatOf`; `src/characters/heroThreat.js` remains exported, and `src/net/foeBounds.js` still folds the compounding `HERO_THREAT` health maximum (`1.04 ** steps`) into worst-case enemy bounds."
  - "In offline play, the gold death toll applies only when Project Legacy resurrects the player (`legacyDeathReset`); with Legacy disabled, death ends the run without deducting gold."
dfu:
  - Assets/Scripts/Game/Entities/EnemyEntity.cs
tags:
  - balance
  - threat-scaling
  - elites
  - death-penalty
  - enhanced-ai
  - offline
---

Enemy progression scaling depends solely on location tier rather than player level, while offline play adopts online elite spawns, default-on enhanced AI, and a 10% resurrection gold toll.

## Location Threat Scaling and Dormant Hero Threat

`PLACE_THREAT` (`src/characters/skillSoftcap.js`) maps location tiers from `from: 4` (`Mine` and `NaturalCave` at `4`, with `Cemetery` below the floor at `3`) up to `full: 18` (`DragonsDen` and `VolcanicCaves` at `18`, and `HarpyNest` at `7`) through `placeVeteran(tier) = clamp01((tier - 4) / 14)`. Dungeons look up their tier in `DUNGEON_RARITY_TIER` (`src/items/lootRarity.js`), while open-wilderness spawns (`inLocation === false` in `src/characters/exteriorFoes.js`) use `wildernessThreat(isNight)` (`5` by day, `7` at night). Place scaling requires `lootRarityOn()` and zeroes out for allies, gate arenas, arena floors, and the Shattered Hour realm.

Both `applyProgressionScalingTo` (`src/scenes/dungeonContext.js`) and `src/characters/exteriorFoes.js` invoke `progressionScaling(null, 0, share, place, null)`, leaving `heroThreatOf` (`src/characters/heroThreat.js`) unused at spawn even though `src/net/foeBounds.js` still includes the compounding `HERO_THREAT` health ceiling in server validation bounds.

## Offline Elites, Preferences, and Death Toll

`elitesAllowed` (`src/characters/eliteFoes.js`) and `rollSearchElite` (`src/items/searchables.js`) allow elite enemies offline whenever `lootRarityOn()` is enabled. `src/mods/features.js` defaults `enhancedAI` to `true`, and `PREF1_ADOPT_NEW_DEFAULT` (`src/ui/uiPrefs.js`) migrates unstamped preference records to enable both `lootRarity` and `enhancedAI`.

On death, `deathGoldLoss` (`src/player/deathPenalty.js`) takes `Math.floor(gold / DEATH_GOLD_DIVISOR)` (`10%`, so `9` gold loses `0` and `100` loses `10`). The death overlay queries `legacyHost.willRise()` (`src/scenes/world.js`) to display `stateDeathLoss` and deducts it on `legacyDeathReset`.
