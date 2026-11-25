---
slug: "enemy-expansion-secondary-arms-and-poison-order"
title: "Enemy Expansion Secondary Weapons and Poison Roll Order"
domain: "combat"
kind: "subcard"
parent: "enemy-expansion-groups-and-corpse-markers-overview"
files:
  - "src/combat/rriEnemyEquipment.js"
  - "src/mods/enemyExpansion/dexEquipment.js"
  - "src/combat/hostCombat.js"
  - "src/characters/campEncounters.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-DEX.md"
related:
  - "enemy-expansion-groups-and-corpse-markers-overview"
  - "enemy-expansion-encounters-spells-and-combat-hooks"
invariants:
  - "Second-weapon equipping reads equipsSecondary from the arm (DEX_RRICompat)."
  - "Poison is rolled before the ConvertOrcish roll (poisonRolled)."
  - "A shield after a two-hander follows the EquipItem rules on the stand-in table."
traps:
  - "rollCampEncounterOnChunkLoad is not called; pin the two camp encounter rolls that are."
  - "The camp GPS feed sends climate only from the chunk."
dfu: []
tags:
  - "enemy-expansion"
  - "equipment"
  - "poison"
  - "encounters"
---

# Enemy Expansion Secondary Weapons and Poison Roll Order

Class equipment assignment shares rules between `src/combat/rriEnemyEquipment.js` and `src/mods/enemyExpansion/dexEquipment.js` to keep base Roleplay & Realism tables and Enemy Expansion custom career loadouts aligned. When a humanoid career rolls its starting kit, secondary weapon assignment checks the `equipsSecondary` flag directly on the arm descriptor (`DEX_RRICompat`). If an enemy rolls a shield after equipping a two-handed weapon, slot resolution follows the `EquipItem` hand-clearing rules on the stand-in equipment table rather than overwriting or ignoring the two-handed weapon state.

## Poison Roll Sequencing and Camp Encounters

During weapon generation in `src/combat/rriEnemyEquipment.js` and `src/mods/enemyExpansion/dexEquipment.js`, the blade poison roll executes before the `ConvertOrcish` material upgrade check and records `poisonRolled` for downstream consumption by `src/combat/hostCombat.js`. Doing the poison roll first keeps PRNG draw order and poison application identical regardless of whether the material converts to Orcish.

In `src/characters/campEncounters.js`, `rollCampEncounterOnChunkLoad` is unused; active camp spawns run only through the two live camp encounter roll entry points, and the camp GPS feed derives climate strictly from the active chunk.
