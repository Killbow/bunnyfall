---
slug: loot-arc-signature-drops-champions-and-drought
title: "Signature Drops, Champion Enemies, and Drought Protection"
domain: items
kind: subcard
parent: loot-arc-overview
files:
  - src/items/lootRarity.js
  - src/characters/champions.js
  - src/items/lootDrought.js
  - src/items/lootLevelGate.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Arc.md"
related:
  - loot-arc-overview
  - loot-arc-drop-rates-renown-and-loot-lines
invariants:
  - "`FOE_FAMILIES` (`undead`, `daedra`, `dragon`, `beast`, `brute`, `caster`, `rogue`, and `warrior`) and `DUNGEON_FAMILY` classify enemies and interiors, while `LEGENDARY_FOUND` boosts matching family Legendaries by `SIGNATURE_WEIGHT = 5`."
  - "Eligible enemies at level `CHAMPION_MIN_LEVEL = 3` or higher promote to champions at `CHAMPION_PER_MILLE = 70` with `CHAMPION_HEALTH = 2`x health, `CHAMPION_DAMAGE = 1.25`x damage, and one of five `CHAMPION_TRAITS` (`mighty`, `stalwart`, `swift`, `vampiric`, or `thorned`)."
  - "`CHAMPION_SOURCE` (`{ tier: 2, quality: 1.25, ladder: 0.5 }`) raises the Legendary roll threshold and halves Magic and Rare thresholds without forcing a guaranteed Rare drop."
  - "The drought multiplier `droughtMult = Math.min(3, 1 + 0.2 * Math.floor(d / 25))` reaches `3`x at 250 qualifying pickups, clamps at `DROUGHT_MAX = 100000`, and resets to `0` upon taking any Legendary or Exalted item."
  - "`rollRarity` multiplies the Legendary threshold by `droughtMult` but clamps the result with `Math.min(rare, ...)` so Legendary odds never surpass the Rare threshold."
traps:
  - "`noteTaken` increments drought only when `item.untaken === true` and immediately clears that flag, preventing drop-and-pickup farming."
  - "When `droughtHeld` is active under the `lootLevelGate.js` level gate, non-Legendary pickups do not increment drought, though finding a Legendary still resets the counter."
  - "Clothing items increment drought only when `legendariesFor(item)` returns at least one matching Legendary record."
  - "`CHAMPION_TRAIT_MAX = 15` in `src/net/wire.js` bounds the serialized 4-bit wire trait index (with 5 traits currently defined)."
dfu: []
tags:
  - signature-drops
  - champions
  - drought
  - bad-luck-protection
---

Target-farming weights, promoted champion enemies, and a persistent bad-luck drought counter steer how players hunt for specific Legendary records.

## Family Signature Weights and Champions

In `src/items/lootRarity.js`, `FOE_FAMILIES` (`undead`, `daedra`, `dragon`, `beast`, `brute`, `caster`, `rogue`, and `warrior`) and `DUNGEON_FAMILY` map each enemy and dungeon theme to a family. When a Legendary drop rolls, `LEGENDARY_FOUND` multiplies the draw weight of records matching that source family by `SIGNATURE_WEIGHT` (`5`).

In `src/characters/champions.js`, enemies of level `CHAMPION_MIN_LEVEL` (`3`) and above spawn as champions at `CHAMPION_PER_MILLE` (`70`), gaining `CHAMPION_HEALTH` (`2`x HP), `CHAMPION_DAMAGE` (`1.25`x attack), and one of five `CHAMPION_TRAITS` (`mighty`, `stalwart`, `swift`, `vampiric`, or `thorned`, bounded on the network by `CHAMPION_TRAIT_MAX` = `15` in `src/net/wire.js`). Slain champions roll loot through `CHAMPION_SOURCE` (`tier: 2`, `quality: 1.25`, `ladder: 0.5`), shifting the rarity thresholds upward without injecting a forced Rare item.

## Drought Protection and Level Gating

`src/items/lootDrought.js` persists a per-character counter (`DROUGHT_MAX` = `100000`) inside the save mod record `LootDrought` (`DROUGHT_SAVE_VENDOR`, checked by `validDroughtRecord`). `noteTaken` counts freshly looted (`untaken === true`) gear (including garments only when `legendariesFor(item)` is non-empty) unless `droughtHeld` (`src/items/lootLevelGate.js`) pauses accumulation below the Legendary level gate. Every 25 qualifying takes adds `0.2` to `droughtMult` up to `3`x at 250 takes, scaling the Legendary cutoff inside `rollRarity` (capped at the `rare` cutoff) until a Legendary pickup resets the counter to `0`.
