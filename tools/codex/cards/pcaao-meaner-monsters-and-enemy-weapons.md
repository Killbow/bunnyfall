---
slug: pcaao-meaner-monsters-and-enemy-weapons
title: "PCAAO Meaner Monsters Edit and Monster Weapon Stand-ins"
domain: combat
kind: subcard
parent: pcaao-combat-overhaul-overview
files:
  - src/combat/pcaaoMeanerMonsters.js
  - src/combat/pcaao.js
  - src/combat/enemyEquipment.js
  - src/characters/enemyEntity.js
  - src/net/foeBounds.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Physical-Combat-Overhaul.md"
related:
  - pcaao-combat-overhaul-overview
  - enemy-expansion-mudex-and-network-bounds
  - enemy-equipment-and-durability-traps
invariants:
  - "`MEANER_MONSTERS` holds 42 frozen rows (damage pairs, health, level, armorValue) copied from the C# InitMod branch. `meanerMonstersRow` overlays a row on the base row at mint and never mutates the base table."
  - "`meanerMonstersOn` needs pcaao `Enabled` and `meanerMonsters` `Enabled`, and is false beside DEX (MUDEX), via `meanerMonstersAlone`."
traps:
  - "src/combat/pcaaoMeanerMonsters.js is a deliberate leaf: enemyEntity.js reads it at mint and must not import the combat formulas."
  - "Class enemies (128+) and monsters not named in the table come back untouched."
dfu:
  - Assets/Scripts/Game/Formulas/FormulaHelper.cs
  - Assets/Scripts/Game/Items/ItemBuilder.cs
tags:
  - pcaao
  - meaner-monsters
  - enemies
  - monster-weapons
---

# PCAAO Meaner Monsters Edit and Monster Weapon Stand-ins

`src/combat/pcaaoMeanerMonsters.js` and `src/combat/pcaao.js` port the optional Meaner Monsters stat table and natural-attack weapon stand-ins for monster careers across `src/characters/enemyEntity.js`, `src/combat/enemyEquipment.js`, and `src/net/foeBounds.js`.

- **Meaner Monsters Table and DEX Exclusion (`src/combat/pcaaoMeanerMonsters.js`, `src/characters/enemyEntity.js`, `src/net/foeBounds.js`):** `MEANER_MONSTERS` contains 42 frozen career overrides (damage pairs, health, level, and `armorValue`) ported from the C# `InitMod` branch. At entity mint, `meanerMonstersRow` overlays the matching entry onto the base career row without mutating the base table, leaving class enemies (`128+`) and unlisted monsters untouched. `src/combat/pcaaoMeanerMonsters.js` stays an import leaf so `src/characters/enemyEntity.js` never pulls in combat formula modules. `meanerMonstersOn` requires both `"pcaao"` `Enabled` and `meanerMonsters` `Enabled`, and evaluates to `false` whenever DEX (MUDEX) is active via `meanerMonstersAlone`.
- **Natural-Attack Stand-In Weapons (`src/combat/pcaao.js`, `src/combat/enemyEquipment.js`):** `SPECIAL_WEAPON_MONSTERS` lists 17 monster careers whose natural attacks count as weapon blows for armor reduction and equipment wear. `pcaaoMonsterWeaponAssign` mints stand-in weapons via `createWeapon(template, material)` from `MONSTER_WEAPON` (such as Skeletal Warrior `15` mapping to `[128, 1]`), and monster stand-ins take zero armor wear under vanilla wear. For shared weapon reference rules and droppable enemy gear invariants, see `enemy-equipment-and-durability-traps`.
