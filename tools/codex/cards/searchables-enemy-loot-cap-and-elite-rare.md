---
slug: searchables-enemy-loot-cap-and-elite-rare
title: "Plain Enemy Loot Cap, Plain Ladder, and Elite Rare Odds"
domain: items
kind: subcard
parent: searchables-overview
files:
  - src/items/foeLootCap.js
  - src/items/lootRarity.js
  - src/characters/eliteFoes.js
  - src/characters/exteriorFoes.js
  - src/characters/cityGuards.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Searchables.md"
related:
  - searchables-overview
  - loot-rarity-source-odds-and-host-seams
  - loot-arc-signature-drops-champions-and-drought
  - balance-arc-place-threat-elites-and-death
invariants:
  - "`PLAIN_FOE_LOOT_CAP = 3` items including gold. `ELITE_DUNGEON_FOE_LOOT_CAP = 5`."
  - "Bosses, world bosses, champions and revenants are exempt from the cap."
  - "`PLAIN_FOE_RARITY_WEIGHTS` are per-mille: magic 50+5/tier cap 190, rare 6+1.2 cap 38, legendary 0.15+0.075 cap 3."
  - "CHAMPION_SOURCE = { tier: 2, quality: 1.25, ladder: 0.5 }."
traps:
  - "ensureChampionLoot is deleted, so champions get no guaranteed Rare."
  - "Capped drops fold gold into one stack, never include quest items, and are ordered Magic+ by tier, then supplies, then gear by price."
  - "rollCorpseKit rolls humanoid kit on the plain ladder at death."
dfu: []
tags:
  - loot
  - enemies
  - elite
  - champion
---

# Plain Enemy Loot Cap, Plain Ladder, and Elite Rare Odds

`src/items/foeLootCap.js`, `src/items/lootRarity.js`, and `src/characters/eliteFoes.js` bound standard enemy corpse drops, soften rarity curves on ordinary enemies, and calibrate elite and champion drop rates.

- **Corpse drop caps and sorting (`foeLootCap.js`, `exteriorFoes.js`, `cityGuards.js`):** Standard enemy corpses cap at `PLAIN_FOE_LOOT_CAP = 3` items including gold, while dungeon elites cap at `ELITE_DUNGEON_FOE_LOOT_CAP = 5`. Bosses, world bosses, champions, and revenants bypass this cap. Capped loot lists merge gold into a single stack, exclude quest items, and sort Magic-or-higher gear by tier first, then supplies, and then common gear by gold value.
- **Plain rarity ladder (`lootRarity.js`):** Ordinary enemies and humanoid kit rolled at death via `rollCorpseKit` evaluate `PLAIN_FOE_RARITY_WEIGHTS` (per-mille weights: `magic` `50 + 5` per tier up to `190`, `rare` `6 + 1.2` per tier up to `38`, and `legendary` `0.15 + 0.075` per tier up to `3`).
- **Champion and elite odds (`eliteFoes.js`, `lootRarity.js`):** Champions roll through `CHAMPION_SOURCE = { tier: 2, quality: 1.25, ladder: 0.5 }` without `ensureChampionLoot` or a guaranteed Rare drop, yielding Rare-or-better odds across two eligible pieces of `3.3%` at level 3, `6.2%` at level 8, `8.5%` at level 12, and `11.4%` at level 17. On elites, `eliteRareChance(level)` equals half of the Magic-or-better chance of a same-level champion (`7.0%` at level 3, `10.4%` at level 8, `13.0%` at level 12, `16.2%` at level 17, and `25.5%` at level 18+), alongside two Magic pieces, one common piece, a `6%` Legendary roll, and gold.
