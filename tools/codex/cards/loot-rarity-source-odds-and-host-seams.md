---
slug: loot-rarity-source-odds-and-host-seams
title: "Rarity Odds by Source, Luck Multiplier, and Host Spawn Seams"
domain: items
kind: subcard
parent: loot-rarity-ladder-overview
files:
  - src/items/lootRarity.js
  - src/items/lootLevelGate.js
  - src/combat/hostCombat.js
  - src/scenes/dungeonContext.js
  - src/scenes/interiorContext.js
  - src/characters/equip.js
  - src/items/loot.js
  - src/items/roomLootHost.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-Rarity.md"
related:
  - loot-rarity-ladder-overview
  - loot-ii-resist-cap-luck-and-wardrobe
  - loot-arc-drop-rates-renown-and-loot-lines
  - enemy-equipment-and-durability-traps
invariants:
  - "`rollRarity(source)` draws once in [0, 1000) and checks Legendary, then Rare, then Magic against `rarityChances`."
  - "Per tier: `min(cap, (base + perTier * tier) * mult * luckMult(luck))` with `RARITY_WEIGHTS` magic {100, 15, 600}, rare {15, 6, 260}, legendary {1, 1.2, 45}; the ladder never inverts (rare <= magic, legendary <= rare)."
  - "`SOURCE_MULT` corpse 1, pile 1.3, boss 2.5; `corpseSource` marks boss at any Daedra or level >= `BOSS_LEVEL` (18)."
  - "Every random threshold is finally multiplied by `MAGIC_DROP_SCALE` (0.25); LOOT-GATE (`rareGate`, `legendaryGate`) scales Rare and Legendary by roller level, never Magic."
  - "Shared room loot bases roll inside `withRollerLevel` at the room level (`src/items/roomLootHost.js`), so every client rolls the same base. `withRollerLevel` throws when its body returns a promise."
traps:
  - "`rollCorpseLoot` skips pieces on the enemy's `equipTableOf` so an enemy never wields a rolled piece (LR4)."
  - "Shops and quest rewards never roll; only the corpse (`spawnEnemyLoot`), dungeon-pile and interior-pile seams call the ladder."
  - "DFU magic items with worn-only powers (`powersNeedWearing`) redraw their base up to `MAGIC_BASE_DRAWS` (64) until `wearableItem` passes (HELD-BASE)."
  - "Player-facing text, patch notes, and release notes must never state the levels, factors, or chances of the level gate (`src/items/lootLevelGate.js`). They may say only that Rare and Legendary gear is rarer early on and more common later."
dfu: []
tags:
  - loot
  - rarity
  - odds
  - luck
  - dungeon
  - corpse
---

# Rarity Odds by Source, Luck Multiplier, and Host Spawn Seams

Rarity thresholds scale by drop source tier, character Luck, global drop scaling, and roller level gates across corpse, dungeon-pile, and interior-pile spawn seams (`src/items/lootRarity.js`, `src/items/lootLevelGate.js`).

- **Threshold Formula and Level Gates (`src/items/lootRarity.js`, `src/items/lootLevelGate.js`):** `rollRarity(source)` draws a single roll in `[0, 1000)` and checks Legendary, Rare, and Magic against `rarityChances`. Each tier computes `min(cap, (base + perTier * tier) * mult * luckMult(luck))` using `RARITY_WEIGHTS` (`magic` `{100, 15, 600}`, `rare` `{15, 6, 260}`, `legendary` `{1, 1.2, 45}`) and `luckMult = clamp(1 + (luck - 50) * LUCK_PCT_PER_POINT / 100, 0.5, 1.5)`, enforcing `legendary <= rare <= magic`. Every random threshold is multiplied by `MAGIC_DROP_SCALE` (`0.25`), while `rareGate` (`RARE_GATE` `{floor: 0.15, holdTo: 7, fullAt: 12}`) and `legendaryGate` (`LEGENDARY_GATE` `{floor: 0.05, holdTo: 9, step: 0.25, fullAt: 15}`) scale Rare and Legendary by roller level.
- **Source Multipliers and Spawn Seams (`src/combat/hostCombat.js`, `src/scenes/dungeonContext.js`, `src/scenes/interiorContext.js`, `src/characters/equip.js`, `src/items/loot.js`):** `SOURCE_MULT` applies `1` for corpses (`ENEMY_BASICS` or entity level), `1.3` for dungeon piles (`DUNGEON_RARITY_TIER[dungeonType]`, `19` entries spanning `3..18`) and tavern or guild piles (`INTERIOR_RARITY_TIER = 4`), and `2.5` for bosses (`corpseSource` on Daedra or level `>= BOSS_LEVEL` of `18`). `rollCorpseLoot` skips items in `equipTableOf` so enemies never wield rolled gear; shops and quest rewards never roll; and `powersNeedWearing` magic items redraw their base up to `MAGIC_BASE_DRAWS` (`64`) until `wearableItem` passes.
