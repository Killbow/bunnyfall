---
slug: loot-ii-resist-cap-luck-and-wardrobe
title: "Rolled Resist Cap, Luck Multiplier, and the Wardrobe Pool"
domain: items
kind: subcard
parent: loot-ii-arc-overview
files:
  - src/items/lootRarity.js
  - src/characters/entityMods.js
  - src/magic/spellcast.js
  - src/justice/clothingStanding.js
  - src/systems/survival/temperature.js
  - src/items/foeLootCap.js
  - src/items/lootPowers.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Loot-II-Arc.md"
related:
  - loot-ii-arc-overview
  - balance-arc-reflection-leech-and-arcane-caps
  - npc-populations-wardrobe-and-creatures
invariants:
  - "Rolled-tier (`ROLLED_TIERS`) resistance lines cap at `RESIST_CAP = 45` per element net of Aetheric pieces' own lines (`rolledCounts`), while body, racial, and spell resistances still clamp at 95 in saving throws."
  - "`luckMult(luck)` clamps `1 + (luck - 50) * LUCK_PCT_PER_POINT / 100` to `[LUCK_MULT_MIN, LUCK_MULT_MAX]` (`[0.5, 1.5]`) and multiplies each source threshold before its cap."
  - "Garment lines and Rare enchantments carry `GARMENT_WORTH_SHARE = 0.5`, and a garment `stat` line rolls Personality only (`GARMENT_STATS`)."
  - "Gear standing caps at `GEAR_STANDING_CAP = 10` per faction group alongside `DRESS_CAP`, and weatherproofing caps at `GEAR_DRY_MOST = 75`% (ignored when wading or submerged)."
traps:
  - "`rolledResistOf` and `lineComparison` skip unidentified worn items so tooltips never leak hidden resistance rolls."
  - "Wardrobe climate offsets apply to felt temperature via `wardrobeCtx` and must never feed into frost or fire resistance."
dfu: []
tags:
  - resistance
  - luck
  - garments
  - wardrobe
  - survival
---

Elemental resistance caps, Luck rarity scaling, and clothing affixes are coordinated across `src/items/lootRarity.js`, `src/characters/entityMods.js`, `src/magic/spellcast.js`, `src/justice/clothingStanding.js`, `src/systems/survival/temperature.js`, and `src/items/foeLootCap.js`.

## Rolled Resistance Cap and Luck Scaling

Resistance lines rolled on `ROLLED_TIERS` gear count toward `RESIST_CAP = 45` per element (`rolledCounts`), excluding innate lines on Aetheric items. Unidentified worn pieces are skipped by `rolledResistOf` and `lineComparison`. Innate body, racial, and active spell resistances remain separate, and `src/magic/spellcast.js` still clamps total saving throws at `95`.

During loot generation, `luckMult(luck)` scales each source threshold by `1 + (luck - 50) * LUCK_PCT_PER_POINT / 100` (with `LUCK_PCT_PER_POINT = 1`), clamped between `LUCK_MULT_MIN` (`0.5`) and `LUCK_MULT_MAX` (`1.5`) before applying the source cap.

## The Wardrobe Pool and Legendary Garments

Clothing skips the main weapon-and-armor tier loop and rolls during `wardrobePass` (while `rollKitGarments` in `src/items/foeLootCap.js` rolls enemy clothing). Garment lines and Rare enchantments value at `GARMENT_WORTH_SHARE = 0.5`, and garment `stat` lines roll only Personality (`GARMENT_STATS`). Social standing bonuses cap at `GEAR_STANDING_CAP = 10` per group beside `DRESS_CAP`. Weatherproofing caps at `GEAR_DRY_MOST = 75`% against rain, offers no protection while wading or submerged, and routes thermal offsets through `wardrobeCtx` (displaying `asleepNote` `'(survival off)'` when Climates and Calories is disabled).

`WARDROBE_LEGENDARIES` defines six pieces: `Alik'r Wayfarer's Robes` (`Desert-Born`), `Wrothgar Pass Mantle` (`Mountain-Born`), `Vestments of Stendarr` (`Stendarr's Mercy`), `Pilgrim's sandals` (`The Long Road`), `Silks of Queen Barenziah` (`Royal Bearing`), and `Shade's cowl` (`Unseen`).
