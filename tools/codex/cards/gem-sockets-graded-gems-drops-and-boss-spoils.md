---
slug: gem-sockets-graded-gems-drops-and-boss-spoils
title: "Graded Gems, Gem Lines, World Finds, and Boss Gems"
domain: items
kind: subcard
parent: gem-sockets-overview
files:
  - src/items/gemGrades.js
  - src/items/gems.js
  - src/items/lootRarity.js
  - src/items/itemLaw.js
  - src/net/recipeLaw.js
  - src/net/professionLaw.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Gem-Sockets.md"
related:
  - gem-sockets-overview
  - breach-receipts-spoils-and-embers
  - sea-serpent-receipts-hoard-and-honours
  - brass-remnant-fight-and-rewards
  - professions-crafting-provenance-and-master-art
invariants:
  - "`GEM_GRADES` orders `'chipped'`, `'flawed'`, `'plain'`, `'flawless'`, and `'perfect'`; `'plain'` reuses classic Daggerfall gem templates `0` through `7`, while `GEM_GRADE_TEMPLATES` (`1900` through `1931`, computed as `GEM_GRADE_TEMPLATE_BASE + g * 8 + k`) sit under `CUSTOM_TEMPLATE_GROUPS.Gems`."
  - "`GEM_GRADE_ROWS` register graded stones as ingredient items priced by `GEM_GRADE_PRICE` (`0.25x`, `0.5x`, `1x`, `2x`, and `4x` the base gem price) and excluded from shop shelves."
  - "`GEM_GRADE_LINES` grants weapon bonuses (ruby fire, sapphire frost, emerald leech, diamond damage, jade willpower, turquoise agility, malachite strength, and amber speed) and armor or jewelry bonuses (ruby fire, emerald poison, sapphire frost, and diamond magic resistance; jade willpower, turquoise personality, malachite endurance, and amber luck)."
  - "`gemFindChance` equals `(GEM_FIND.base + GEM_FIND.perTier * tier) * SOURCE_MULT * luckMult` (`base = 10`, `perTier = 2`), capped at `50` per mille."
  - "`GEM_GRADE_BANDS` shift grade weights at tiers `0`, `5`, `10`, `15`, and `20`, while boss drops offset the lookup by `GEM_BOSS_TIERS` (`4` tiers deeper)."
traps:
  - "`BOSS_GEMS` awards `{ gate: 1, serpent: 1, abyss: 2 }` rolled at `BOSS_GEM_SOURCE` (tier `21`, `'boss'`, always hitting the top grade band); Elite Gate spoils also call `bossGems('gate')`, and the sea serpent gem drops only to a ship with `dealt: true`."
dfu: []
tags:
  - gems
  - grades
  - drops
  - world-bosses
  - jewelcraft
---

# Graded Gems, Gem Lines, World Finds, and Boss Gems

`src/items/gemGrades.js` and `src/items/gems.js` expand the eight classic Daggerfall gems across five quality grades (`GEM_GRADES`: `'chipped'`, `'flawed'`, `'plain'`, `'flawless'`, and `'perfect'`).

## Templates, Pricing, and Jeweler Bench Points

Plain stones retain classic Daggerfall `Gems` templates (`0` through `7`). The four non-plain grades use `GEM_GRADE_TEMPLATES` `1900` through `1931` (`GEM_GRADE_TEMPLATE_BASE + g * 8 + k`) under `CUSTOM_TEMPLATE_GROUPS.Gems`. `GEM_GRADE_ROWS` scales base value by `GEM_GRADE_PRICE` (`0.25x`, `0.5x`, `1x`, `2x`, and `4x`) and keeps graded stones off shop shelves. The jeweler bench (`src/net/recipeLaw.js`, `src/net/professionLaw.js`) accepts every grade in `GRADED_GEMS`, scoring `gemPointsPct` as `GEM_POINTS` (`10`) times `GEM_GRADE_PRICE`.

## Socketed Stat Lines

`GEM_GRADE_LINES` maps each gem kind to equipment affixes:

- **Weapons:** Ruby adds fire, sapphire frost, emerald leech, diamond damage, jade willpower, turquoise agility, malachite strength, and amber speed.
- **Armor and jewelry:** Ruby adds fire, emerald poison, sapphire frost, and diamond magic resistance; jade adds willpower, turquoise personality, malachite endurance, and amber luck.

## World Drop Odds and Boss Spoils

`gemFindChance` rolls `(GEM_FIND.base + GEM_FIND.perTier * tier) * SOURCE_MULT * luckMult` (`base = 10`, `perTier = 2`), capped at `50` per mille. `GEM_GRADE_BANDS` shifts weights at tiers `0`, `5`, `10`, `15`, and `20`, with bosses offsetting by `GEM_BOSS_TIERS` (`4`). `BOSS_GEMS` (`{ gate: 1, serpent: 1, abyss: 2 }`, with Elite Gates calling `bossGems('gate')` and serpent spoils requiring `dealt: true`) rolls at `BOSS_GEM_SOURCE` (tier `21`, `'boss'`).
