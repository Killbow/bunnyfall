---
slug: "classic-systems-spine-overview"
title: "Classic Systems Spine: Item Fields, Entity Modifiers, and Shared Host Engines"
domain: "systems"
kind: "overview"
parent: null
files:
  - "src/items/itemFields.js"
  - "src/items/loot.js"
  - "src/items/lootRarity.js"
  - "src/net/wire.js"
  - "src/characters/entityMods.js"
  - "src/characters/statMods.js"
  - "src/scenes/shared.js"
  - "src/magic/hostMagic.js"
  - "src/magic/hostEnchant.js"
  - "src/combat/hostCombat.js"
  - "src/magic/effects.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Systems-Arc.md"
related:
  - "four-hosts-and-modal-frame"
  - "world-tick-day-change-and-synthetic-time"
  - "save-snapshots-and-character-identity"
  - "guild-rank-faction-rep-and-crime-guilds"
  - "loot-rarity-ladder-overview"
  - "economy-ledger-and-item-judge"
invariants:
  - "src/items/itemFields.js declares item fields once. LOOT_ARRAY_FIELDS (src/items/loot.js:635) is derived from itemFieldsOfKind('array'), and validLootItem/validItemFields check against that declaration."
  - "validAffix (src/items/lootRarity.js:842) guards every reader of rolled affix lists, both on the wire and in saves."
  - "computeEntityMods (src/characters/entityMods.js:118) folds modifier channels onto entity._mods. entityArmorMod, entitySkillMod, entityStatMod, entityWeightMult, entityResistMod, and weaponDamageMods all read from that one hub."
  - "liveStat (src/characters/statMods.js:47) is the only path for reading a live attribute. Fortify, Drain, Transfer, disease, poison, and affliction modifiers all route through it."
traps:
  - "Wiring a casting, enchant, or combat hook into one host instead of src/magic/hostMagic.js, src/magic/hostEnchant.js, src/combat/hostCombat.js, or src/scenes/shared.js breaks parity across the four hosts."
  - "Adding an item field without declaring it in src/items/itemFields.js lets validLootItem drop or reject it after a wire or save round-trip."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/EntityEffectBroker.cs"
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "systems"
  - "items"
  - "entity-mods"
  - "hosts"
  - "magic"
---

# Classic Systems Spine: Item Fields, Entity Modifiers, and Shared Host Engines

Core gameplay systems keep item schemas, modifier hubs, and host engines in single shared definitions across all four scene hosts (`four-hosts-and-modal-frame`).

- **Item field declarations (`src/items/itemFields.js`, `src/items/loot.js`, `src/items/lootRarity.js`, `src/net/wire.js`):** Item fields are declared once in `src/items/itemFields.js`. `LOOT_ARRAY_FIELDS` derives from `itemFieldsOfKind('array')`, and `validLootItem` and `validItemFields` validate against that schema so undeclared fields do not survive save or wire round-trips. In `src/net/wire.js`, `validLookItem` clamps `hello` look fields from the same field set rather than rejecting the packet, while `validAffix` guards rolled affix lists across saves and wire payloads.
- **Entity and attribute modifiers (`src/characters/entityMods.js`, `src/characters/statMods.js`):** `computeEntityMods` folds modifier channels, including `LOOT_RARITY_FOLD = 'lootRarity'`, onto `entity._mods`, feeding `entityArmorMod`, `entitySkillMod`, `entityStatMod`, `entityWeightMult`, `entityResistMod`, and `weaponDamageMods`. Live attribute reads go exclusively through `liveStat`, which combines Fortify, Drain, Transfer, disease, poison, and affliction modifiers, while `maxFatigue` stores classic fatigue at a `x64` scale.
- **Shared host engines (`src/scenes/shared.js`, `src/magic/hostMagic.js`, `src/magic/hostEnchant.js`, `src/combat/hostCombat.js`, `src/magic/effects.js`):** Casting, enchantment, and combat hooks live in `hostMagic.js`, `hostEnchant.js`, and `hostCombat.js` (including the `spawnEnemyLoot` seam), paired with `createPlayerTicker`, `createRestDeps`, `restVitals`, `restFullyHealed`, and `loadMagicRegistries` in `shared.js`, plus `applySpell` and `tickActiveEffects` in `effects.js`.
