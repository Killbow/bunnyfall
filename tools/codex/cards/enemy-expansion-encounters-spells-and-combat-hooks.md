---
slug: enemy-expansion-encounters-spells-and-combat-hooks
title: "Enemy Expansion Encounter Tables, Spells, Combat Hooks, and Equipment"
domain: combat
kind: subcard
parent: enemy-expansion-overview
files:
  - src/mods/enemyExpansion/dexEncounters.js
  - src/characters/encounterTableDoor.js
  - src/characters/dungeonEnemies.js
  - src/world/playerGps.js
  - src/mods/enemyExpansion/dexSpells.js
  - src/characters/enemySpells.js
  - src/magic/standardSpells.js
  - src/mods/enemyExpansion/dexCombat.js
  - src/combat/formulas.js
  - src/mods/enemyExpansion/dexEquipment.js
  - src/combat/rriEnemyEquipment.js
  - src/combat/enemyEquipment.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Enemy-Expansion.md"
related:
  - enemy-expansion-overview
  - enemy-equipment-and-durability-traps
  - living-world-roads-trips-and-encounters
invariants:
  - "Dungeon encounter table selection is deterministic: it seeds `DFRandom.srand(Unknown2 ^ (region << 8))`, picks `rand() % count`, and restores the prior PRNG state."
  - "Climate and city encounter tables roll on `PlayerGPS` transitions: day and night tables update on climate changes or location-rect exit, and city-night tables update on location-rect entry."
  - "`resetPlayerGpsState` clears the in-rect flag only on `'load'` and `'travel'` jumps, matching `PlayerGPS.ResetState`."
  - "Custom monster spells use indices `500-503` (`Blood Leech`, `Daemon Touch`, `Wrack`, and `Bolt of Vengeance`), each named with an exclamation-mark prefix and merged from `SpellRecords.json` via `registerSpellRecordsAsset`."
traps:
  - "An encounter table whose enemy IDs fail to parse remains in the candidate list, so a selection landing on it leaves the active table unchanged."
  - "Spellbook table names match case-insensitively; an unrecognized name logs once at install and falls back to the classic spellbook list."
dfu:
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryMod.cs
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryEnemySpells.cs
tags:
  - enemy-expansion
  - encounters
  - spellbooks
  - on-hit
  - equipment
---

# Enemy Expansion Encounter Tables, Spells, Combat Hooks, and Equipment

While loaded, Enemy Expansion overrides dungeon and climate encounter selection, appends custom monster spells and spellbooks, extends on-hit combat formulas, and swaps in its class equipment assigner (`src/mods/enemyExpansion/dexEncounters.js`, `src/mods/enemyExpansion/dexSpells.js`, `src/mods/enemyExpansion/dexCombat.js`, and `src/mods/enemyExpansion/dexEquipment.js`).

- **Encounter tables (`dexEncounters.js`, `encounterTableDoor.js`, `dungeonEnemies.js`, `playerGps.js`):** `createDexEncounterSelector` hooks `registerEncounterTableSelector` and `onPlayerGpsEvents`. Dungeon interiors seed `DFRandom.srand(Unknown2 ^ (region << 8))`, pick `rand() % count`, and restore the generator state. Exterior tables re-roll day and night lists on climate transitions or rect exit and roll city-night lists on rect entry, while `resetPlayerGpsState` clears rect state only on `'load'` and `'travel'` jumps.
- **Spells and spellbooks (`dexSpells.js`, `enemySpells.js`, `standardSpells.js`):** `registerSpellRecordsAsset` merges custom spells `500-503` (`Blood Leech`, `Daemon Touch`, `Wrack`, and `Bolt of Vengeance`, each named with an exclamation-mark prefix in `SpellRecords.json`). `DEX_SPELLBOOK_TABLES` defines `13` career spellbooks plus a `7`-step `'Class'` caster ladder at `minLevel` `0`, `3`, `6`, `9`, `12`, `15`, and `18`.
- **Combat hooks and equipment (`dexCombat.js`, `formulas.js`, `dexEquipment.js`, `rriEnemyEquipment.js`, `enemyEquipment.js`):** `registerFormulaOverride('onMonsterHit')` extends the nine classic `OnMonsterHit` branches with branches `10-13` (`Blood Leech` `500`, `Silence` `23`, `Daemon Touch` `501`, and `Wrack` `502`). Companion hooks run `registerSkeletalTarget`, `registerEnemyGroup`, `registerEnemyLanguage`, and `registerForcedGender`, while `createDexEquipmentAssigner` applies the Roleplay & Realism class equipment rules to custom classes.
