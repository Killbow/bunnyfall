---
slug: enemy-expansion-overview
title: "Daggerfall Enemy Expansion Overview"
domain: characters
kind: overview
parent: null
files:
  - src/mods/enemyExpansion/dexInstall.js
  - src/mods/enemyExpansion/dexSwitches.js
  - src/mods/enemyExpansion/dexIds.js
  - src/mods/enemyExpansion/dexTables.js
  - src/mods/modSettings.js
  - src/scenes/shared.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Enemy-Expansion.md"
related:
  - enemy-expansion-registry-sprites-and-bodies
  - enemy-expansion-encounters-spells-and-combat-hooks
  - enemy-expansion-troll-corpse-lifecycle
  - enemy-expansion-mudex-and-network-bounds
  - realm-saves-and-mod-save-hooks
invariants:
  - "`installEnemyExpansion` runs once per page after Roleplay & Realism initializes, mirroring `BestiaryMod.Start`."
  - "The `Enabled` switch latches at load time through `latchModLoaded`; toggling it mid-session takes effect on the next game load."
  - "Even when disabled, all `50` custom enemy rows, career templates, localized names, sprite archives, and Morrowind body mappings register unconditionally so existing saves always deserialize."
  - "Classic enemy row overrides, quest enemies, encounter tables, custom spells and spellbooks, combat hooks, forced genders, the troll corpse prefab, and equipment assignment activate only while `dexLoaded()` is true."
traps:
  - "Never gate custom enemy row registration on `dexLoaded()`; loading a save that contains a custom enemy would fail to resolve its career row."
  - "`dexProperties` returns overrides for classic enemy IDs only while `dexLoaded()` is true, whereas properties for custom enemy IDs return unconditionally."
dfu:
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryMod.cs
tags:
  - dex
  - enemy-expansion
  - mods
  - enemies
---

# Daggerfall Enemy Expansion Overview

Daggerfall Enemy Expansion (`src/systems/enemyExpansion/`, vendor key `DEX_VENDOR = 'daggerfall-enemy-expansion'`, based on version `1.3.4` in `vendor/daggerfall-enemy-expansion`) adds `50` custom enemy types, updates classic enemy rows and encounter tables, introduces custom monster spells and troll regeneration, and integrates with Meaner Monsters through `MUDEX_VENDOR = 'mudex'` (`vendor/mudex`).

- **Two-tier initialization (`src/mods/enemyExpansion/dexInstall.js`, `src/mods/enemyExpansion/dexSwitches.js`, `src/scenes/shared.js`):** `installEnemyExpansion` executes once per page after Roleplay & Realism setup, and `latchModLoaded` snapshots the mod settings (`src/mods/modSettings.js`) on game load. Unconditional startup registers all `50` custom enemy definitions (`src/mods/enemyExpansion/dexIds.js`), career templates, names, stand-in sprite archives, and Morrowind creature mappings so saved games containing custom enemies load safely even when the mod is turned off.
- **Latch-gated runtime hooks (`src/mods/enemyExpansion/dexTables.js`):** Bundled CSV tables (`DEX_TABLE_TEXT` in `src/mods/enemyExpansion/dexTableText.js` and `MUDEX_TABLE_TEXT` in `src/mods/enemyExpansion/mudexTableText.js`) parse into classic row overrides, quest enemy entries, and regional encounter replacements that apply only while `dexLoaded()` is true. While active, the mod also enables custom monster spells, spellbooks, combat hooks, forced gender overrides, the regenerative troll corpse prefab, and the class equipment assigner. `dexProperties` follows the same split, returning custom-ID metadata at all times while gating classic-ID overrides behind `dexLoaded()`.
- **Subcards:** `enemy-expansion-registry-sprites-and-bodies`, `enemy-expansion-encounters-spells-and-combat-hooks`, `enemy-expansion-troll-corpse-lifecycle`, and `enemy-expansion-mudex-and-network-bounds`.
