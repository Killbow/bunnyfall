---
slug: foraging-tool-checks-and-yields
title: "Foraging Tool Checks, Yield Tables, and Wear"
domain: systems
kind: subcard
parent: foraging-mod-overview
files:
  - src/professions/foragingLaw.js
  - src/professions/foragingInstall.js
  - src/professions/foragingCore.js
  - src/net/nodeLaw.js
  - src/formats/mapsTables.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Foraging.md"
related:
  - foraging-mod-overview
  - foraging-loot-hooks-and-forage-fix
invariants:
  - "`CHECK_ORDER` per tool. Wood-Axe, Pick-Axe, Sickle and Basket: inside, town, daylight, sea, enemies, encumbered. Fishing-Net: inside, dungeon, town, daylight, enemies, encumbered, water. Spade: inside, town, cemetery, enemies, encumbered."
  - "Daylight is `isForagingDaylight(hour)`, true for hours 7-17 inclusive."
  - "The sea check refuses climate Ocean (223). The Spade's cemetery check requires inLocationRect and locationType Graveyard (12)."
  - "The Fishing-Net's water check passes on swimming, ON_EXTERIOR_WATER Swimming or WaterWalking, climate Ocean, or region `SEA_REGION` (31)."
  - "Encumbered refuses only when carriedWeight >= maxEncumbrance, so a NaN compare passes."
  - "Wear runs only if the tool's quest started. On break, DFU's popup comes first, then HUD 'Your <Tool> broke.', then removal. A final-use break still keeps the yield and the quest."
traps:
  - "Q3: the Pick-Axe band uses (INT+AGI)/2 (LiveAgility), not Endurance as the readme says."
  - "Q4: the Fishing-Net 'dungeon' check is dead code, because 'inside' has already refused."
  - "A refusal prints HUD text and returns `{ refused: true }`, which falls through to the normal inventory ladder."
dfu: []
tags:
  - foraging
  - prerequisites
  - yield-tables
  - durability
---

# Foraging Tool Checks, Yield Tables, and Wear

`src/professions/foragingLaw.js`, `src/professions/foragingCore.js`, and `src/professions/foragingInstall.js` evaluate per-tool prerequisite ladders (`CHECK_ORDER`), resolve stat-banded yields or quests, and apply durability wear.

- **Prerequisite Checks**: Wood-Axe, Pick-Axe, Sickle, and Basket check `inside`, `town`, `daylight` (`isForagingDaylight(hour)`, hours 7-17 inclusive), `sea` (refusing climate Ocean 223 in `src/formats/mapsTables.js`), `enemies`, and `encumbered` (`carriedWeight >= maxEncumbrance`). Fishing-Net checks `inside`, `dungeon` (dead code Q4), `town`, `daylight`, `enemies`, `encumbered`, and `water` (swimming, `ON_EXTERIOR_WATER` Swimming or WaterWalking, climate Ocean, or `SEA_REGION` 31 in `src/net/nodeLaw.js`). Spade checks `inside`, `town`, `cemetery` (`inLocationRect` and `locationType` Graveyard 12), `enemies`, and `encumbered`. Any refusal prints HUD text and returns `{ refused: true }`.
- **Yields and Quests**:
  - **Wood-Axe**: Rolls `WOOD_BUNDLE_TABLES` (desert 224 and 225 vs. other climates) by `(INT + STR) / 2` and starts `ChopWoodQuest`.
  - **Pick-Axe**: Picks from `MINING_QUESTS` (`Weakest` to `MiningQuest`) by `(INT + AGI) / 2` (Q3 uses LiveAgility).
  - **Sickle**: `sickleQuest(climate, month)` returns Arid in desert, Winter in Subtropical or Mountain, Summer in Swamp or Rainforest, and Winter in winter months (8-11, 0, and 1).
  - **Fishing-Net**: Rolls `FISH_TABLES` by `(INT + AGI) / 2`, starts `FishingQuest`, and yields Climates and Calories Raw Fish when enabled.
  - **Spade**: Picks from `GRAVE_QUESTS` by `(INT + END) / 2` (Cheb Necromancy quests are omitted).
  - **Basket**: Runs `basketDraw` (count by INT, foods from `BASKET_BLOCKS`) and `basketFind`, starting `ForageFoodQuest`.
- **Wear**: Wear runs only when the quest starts; breaking shows the popup, prints `'Your <Tool> broke.'`, and removes the tool.
