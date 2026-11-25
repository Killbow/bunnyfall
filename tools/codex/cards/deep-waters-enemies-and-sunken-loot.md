---
slug: "deep-waters-enemies-and-sunken-loot"
title: "Deep Waters Underwater Enemies, Wrecks, and Stray Loot"
domain: "world"
kind: "subcard"
parent: "deep-waters-overview"
files:
  - "src/world/underwaterEnemies.js"
  - "src/underwater/deepWatersEncounters.js"
  - "src/characters/exteriorFoes.js"
  - "src/world/underwaterLoot.js"
  - "src/underwater/deepWatersLoot.js"
  - "src/items/droppedLoot.js"
  - "src/mods/modSettings.js"
routes: []
tables: []
replacesBible:
  - "03-World/Deep-Waters.md"
related:
  - "deep-waters-overview"
  - "deep-waters-swim-driver-and-forge"
  - "loot-arc-overview"
invariants:
  - "DEPTH_AQUATIC_TABLE weights Slaughterfish, Lamia, Nymph, Dreugh, Zombie, Skeletal Warrior, Ghost, Wraith, Ice Atronach, Vampire and Lich by depth band. Past BOSS_MIN_DEPTH_FRACTION 0.6, BOSS_SPAWN_CHANCE 0.01 picks the Ancient Lich or the Vampire Ancient."
  - "Treasure guards: RARE_TYPES at TREASURE_GUARD_DISTANCE 8-30 m outside the player's view, up to MAX_TREASURE_GUARD_COUNT 5 at enemy frequency >= 0.6."
  - "Exterior enemies swim only while the swim driver publishes the forged waterLevelY (the null default means no water)."
  - "Loot pulse: LOOT_PULSE_DISTANCE 90 m, MIN_PULSE_INTERVAL_SECONDS 8, FAILED_PULSE_RETRY_SECONDS 3, DESPAWN_DISTANCE 140."
  - "Caps come from settings: MaxLiveLootObjects default 192 (max 256), MaxLiveTreasureClusters default 12 (max 32)."
traps:
  - "The loot spawner has no offsetAll, as in the mod. After a FloatingOrigin shift the next pulse forgets every wreck past 140 m. Piles move only through droppedLoot.offsetAll."
dfu: []
tags:
  - "deep-waters"
  - "enemies"
  - "loot"
  - "wrecks"
  - "treasure"
---

# Deep Waters Underwater Enemies, Wrecks, and Stray Loot

Depth-banded aquatic enemy tables, treasure cluster guards, sunken wreck clusters, and stray seafloor loot run across `src/world/underwaterEnemies.js`, `src/underwater/deepWatersEncounters.js`, `src/characters/exteriorFoes.js`, `src/world/underwaterLoot.js`, `src/underwater/deepWatersLoot.js`, `src/items/droppedLoot.js`, and `src/mods/modSettings.js`.

- **Depth-banded enemies and treasure guards:** `DEPTH_AQUATIC_TABLE` (`src/world/underwaterEnemies.js`) weights Slaughterfish, Lamia, Nymph, Dreugh, Zombie, Skeletal Warrior, Ghost, Wraith, Ice Atronach, Vampire, and Lich by depth fraction; deeper than `BOSS_MIN_DEPTH_FRACTION` (`0.6`), `BOSS_SPAWN_CHANCE` (`0.01`) rolls an Ancient Lich or Vampire Ancient. Treasure clusters spawn `RARE_TYPES` guards at `TREASURE_GUARD_DISTANCE` (`8..30` m) outside the player view cone, up to `MAX_TREASURE_GUARD_COUNT` (`5`) when enemy frequency is at least `0.6`. In `src/characters/exteriorFoes.js`, aquatic exterior enemies swim only while the swim driver publishes the forged `waterLevelY` (`null` means no water).
- **Wrecks, stray loot pulses, and floating-origin traps:** Seafloor loot (`src/world/underwaterLoot.js` and `src/underwater/deepWatersLoot.js`) pulses within `LOOT_PULSE_DISTANCE` (`90` m) every `MIN_PULSE_INTERVAL_SECONDS` (`8` s, retrying after `FAILED_PULSE_RETRY_SECONDS` `3` s) and despawns past `DESPAWN_DISTANCE` (`140` m), bounded by `MaxLiveLootObjects` (default `192`, max `256`) and `MaxLiveTreasureClusters` (default `12`, max `32`). Wrecks require depth fraction at least `WRECK_MINIMUM_DEPTH_FRACTION` (`0.5`) and place `24` debris flats (`48` in a cove) with `3..5` piles (`6..10` in a cove) holding `2..4` items each (`4..8` in a cove). Piles draw from `TEXTURE.216` (`25` records), brighten underwater via `BrightenUnderwaterBillboards` (`src/items/droppedLoot.js`), roll `FillRandomItem` bands (`25%` religious, `20%` potion, then jewelry, gem, clothing, weapon, and armor), and shift only via `droppedLoot.offsetAll` because the loot spawner itself has no `offsetAll`.
