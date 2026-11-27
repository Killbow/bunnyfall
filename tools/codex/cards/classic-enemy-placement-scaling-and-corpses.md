---
slug: "classic-enemy-placement-scaling-and-corpses"
title: "Enemy Placement, Scaling Order, Champions, and Corpse Markers"
domain: "combat"
kind: "subcard"
parent: "enemy-expansion-groups-and-corpse-markers-overview"
files:
  - "src/characters/dungeonEnemies.js"
  - "src/characters/eliteFoes.js"
  - "src/characters/enemyEntity.js"
  - "src/characters/champions.js"
  - "src/characters/encounters.js"
  - "src/characters/campEncounters.js"
  - "src/characters/enemyAnchor.js"
  - "src/characters/corpseMarker.js"
routes: []
tables: []
replacesBible: []
related:
  - "enemy-expansion-groups-and-corpse-markers-overview"
  - "balance-arc-place-threat-elites-and-death"
  - "loot-arc-signature-drops-champions-and-drought"
invariants:
  - "Gold piles taken from a corpse go to the gold counter, never into the player's item list, which must not hold currency. The loop iterates a copy because `takeOneInto` splices the source."
  - "`expandEliteEnemies` uses fixed offsets and no random draws, so every client builds the same list in the same order. The online enemy frame indexes layout records by position."
  - "A placed monster the map did not grade for this level is re-drawn from the dungeon table with a seed built from the location id, marker, and block index, so every client draws the same type."
  - "`enemyHierarchyOrder` returns a copy of the pool in DFU hierarchy order: per block, fixed enemies before random ones, then later spawns in arrival order. The first `layoutCount` records come from the layout."
  - "`promoteEliteFoe` applies the Elite Dungeon and Super Dungeon health multipliers itself, in place of the normal elite one. Callers must not add their own dungeon doubling on top."
  - "`applyProgressionScaling` runs after `makeEnemyEntity` and the elite pass. It raises `challengeLevel` and leaves `level` alone, so spell magnitudes, loot, and gear are not scaled a second time."
  - "`rollCampEncounter` runs once per elapsed minute only after the single-encounter roll came back empty, so a lone enemy and a group never both spawn in the same minute."
  - "`applyChampion` runs before the loot roll, because the loot roll reads the champion mark."
  - "The order of `CHAMPION_TRAITS` is the wire index sent as `cp`. Insert new traits only at the end, and keep `CHAMPION_TRAIT_MAX` in `src/net/wire.js` in step."
  - "`rollStreetChampion` picks from a hash of position, type, and pool count and never draws a random number, so the pool's loot and kit stream is unchanged and seeded tests stay identical."
traps:
  - "`mintCorpseMarker` reads the floor position after the texture await, from the pool's live `feet` array. A floating-origin recenter during the read shifts feet in place, so an earlier copy strands the body."
  - "Taking a corpse's items leaves it enabled. `corpsePrelude` disables the body only on the next activation that finds it empty, so the player hears 'The body has no treasure.' first, as in classic."
  - "A custom marker (`isCustomData`) takes all 16 bits of `factionOrMobileId` as its monster type and skips the type 99 test. A classic marker masks to the low 8 bits first."
  - "`preventEnemySpawns` is a one-update shield raised by arms that skip time the player did not live, such as fast travel, the vampirism transformation, and the jail skip. The host that runs the catch-up spawn loop reads and clears it, so skipped days run no catch-up rolls."
  - "A dungeon save written before the `anchor` stamp restores through `keepRebuiltSpawn`: a flyer whose saved feet equal the rebuilt spawn feet plus half the idle height keeps the rebuilt spawn. Moved flyers restore verbatim."
dfu: []
tags:
  - "dungeon-enemies"
  - "elites"
  - "champions"
  - "corpses"
---

# Enemy Placement, Scaling Order, Champions, and Corpse Markers

Enemies enter the world through the dungeon layout (`src/characters/dungeonEnemies.js`, a port of DFU RDBLayout placement), random and camp encounters (`src/characters/encounters.js`, `src/characters/campEncounters.js`), and the street pools. Every online client must build the same list in the same order, so placement draws use seeds or fixed offsets.

- **Build order:** `makeEnemyEntity`, then elite promotion, then progression scaling, then champion traits, then the loot roll.
- **Anchors:** `src/characters/enemyAnchor.js` places the sprite and capsule relative to the DFU position.
- **Corpses:** `src/characters/corpseMarker.js` mints lootable corpse markers for the exterior pools and the dungeon host.
