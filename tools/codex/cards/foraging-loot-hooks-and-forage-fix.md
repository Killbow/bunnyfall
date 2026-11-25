---
slug: foraging-loot-hooks-and-forage-fix
title: "Foraging Loot Hooks, Shop Shelving, Quirks, and FORAGE-FIX"
domain: systems
kind: subcard
parent: foraging-mod-overview
files:
  - src/professions/foragingLaw.js
  - src/professions/foragingInstall.js
  - src/systems/quest/questData.js
  - src/systems/quest/questActionsExtension.js
  - src/items/containerLoot.js
  - src/items/loot.js
  - src/characters/corpseMarker.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Foraging.md"
related:
  - foraging-mod-overview
  - foraging-tool-checks-and-yields
  - loot-arc-overview
invariants:
  - "Each hook item: pick from the table, then `rollForagingItemUsed(FORAGING_ITEM_CODES, ...)`, then `determineForagingItem` (codes 1-7 map to 1600-1604, 1606, 1607). All `FORAGING_ITEM_RARITIES` are 10, so all seven codes weigh the same (Q1)."
  - "`DUNGEON_LOOT_ARMS`: Prison/Mine 25%/max 5; Strongholds 20%/4; Crypt/Ruined Castle/Cemetery 15%/3; Desecrated Temple/Coven 10%/2; Vampire Haunt/Laboratory 5%/1. Counts are `floor(rng*max)`."
  - "`FORAGE_FIX_PATCHES` patches exact old text with exact occurrence counts and throws on a mismatch. Vendored quest files stay verbatim, and `applyForageFix` runs when questData reads the pack."
traps:
  - "Q2: `Range(0,1)` is always 0, so Pawn Shop shelves, Palace containers, and Vampire Haunt/Laboratory piles never yield."
  - "Q12: interior piles pass the location index straight into the dungeon-arm lookup."
  - "Q6: `update-quest-item _x_ Leveled` matches no QAE action and is inert."
dfu: []
tags:
  - foraging
  - loot-hooks
  - forage-fix
  - quirks
  - shop-stock
---

# Foraging Loot Hooks, Shop Shelving, Quirks, and FORAGE-FIX

Foraging adds drops to containers, dungeon piles, enemy corpses, and shop shelves (`src/professions/foragingLaw.js` and `src/professions/foragingInstall.js`), while `applyForageFix` patches vendored quests at load.

- **Loot Hooks (Q1)**: Under vendor key `'foraging'`, `installForaging` registers `onForagingContainerLoot` (`src/items/containerLoot.js`), `onForagingPileLoot` (`src/items/loot.js`), and `onForagingEnemyDeath` (`src/characters/corpseMarker.js`). Drops draw from `FORAGING_LOOT_TABLES`, run `rollForagingItemUsed(FORAGING_ITEM_CODES, ...)`, and map codes 1-7 to templates 1600-1604, 1606, and 1607 via `determineForagingItem`. All `FORAGING_ITEM_RARITIES` are 10, weighting all seven codes equally.
- **Drop Rates**: General Store shelves roll 0-1 items, house containers 15%, and Palace containers 30%. `DUNGEON_LOOT_ARMS` rolls `floor(rng * max)`: Prison and Mine 25% (max 5); Strongholds 20% (max 4); Crypt, Ruined Castle, and Cemetery 15% (max 3); Desecrated Temple and Coven 10% (max 2); and Vampire Haunt and Laboratory 5% (max 1). Enemy deaths roll 5% for class careers 1, 8, and 13-16, and 2% for monster careers 7, 12, and 16.
- **Quirks and Shelving**: `Range(0, 1)` returns 0 (Q2), so Pawn Shop shelves, Palace containers, and Vampire Haunt or Laboratory piles never yield. Interior piles pass the location index straight into the dungeon-arm table (Q12), and `update-quest-item _x_ Leveled` is inert (Q6). `foragingCustomItemsForGroup` shelves twelve templates when enabled, or six tools online when disabled.
- **FORAGE-FIX**: `FORAGE_FIX_PATCHES` (`applyForageFix` in `src/systems/quest/questData.js`) patches Q7 (`_rich_` in `Mining*`), Q8 (`FetchWood01`-`04` class 20 -> 9), Q9 (summer plants 5 and 6 permanence), and Q13 (QuestList social groups Commoners and Nobility). Q10 is fixed in `basketFind`, and Q11 in `PlayerHandsover` (`src/systems/quest/questActionsExtension.js`, pack before wagon).
