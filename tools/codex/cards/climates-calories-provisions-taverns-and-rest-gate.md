---
slug: "climates-calories-provisions-taverns-and-rest-gate"
title: "Survival Items, Water Sources, Tavern Menus, and the Hard Rest Gate"
domain: "systems"
kind: "subcard"
parent: "climates-calories-survival-overview"
files:
  - "src/systems/survival/items.js"
  - "src/systems/survival/food.js"
  - "src/systems/survival/loot.js"
  - "src/systems/survival/tavernMenu.js"
  - "src/systems/survival/rest.js"
  - "src/systems/survival/camp.js"
  - "src/systems/survival/camps.js"
  - "src/ui/tavernWindow.js"
  - "src/render/textureReplacement.js"
  - "src/combat/duelCombat.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Climates-Calories.md"
related:
  - "climates-calories-survival-overview"
  - "climates-calories-needs-clock-and-boons"
  - "rest-arc-campfires-charges-and-dungeon-fires"
  - "market-vendors-and-professions"
  - "kings-gambit-tavern-regulars-and-purses"
invariants:
  - "Survival item templates `530` to `540` port upstream items and template `541` adds the reusable Campfire via `registerCustomTemplates` (`src/systems/survival/items.js`)."
  - "startingProvisions: 2 Rations, a Waterskin, a hood-up cloak and Shoes at quarter condition, half-worn Camping Equipment, a full Campfire."
  - "Water sources: flats 212 [0, 2, 8, 9] and 85 [0], models 41220-41222, reached within CAMP_REACH 3.2."
  - "Tavern menus key by region (n, ne, se, s, b, o) then MENU_KEY_BY_CLIMATE; menuTier <5 low, <13 mid, else high; breakfast 06:00-10:00, kitchen closed before 06:00."
  - "restBlock refuses freezing/deadly cold without a fire or roof, and scorching anywhere; installSurvivalRestGate registers cold and hot as two RegisterPreventRestCondition handlers."
traps:
  - "MENU_KEY_BY_CLIMATE is keyed by CLIMATES names, not numbers (MENU-CLIMATE off-by-one fix)."
  - "corpseFoodOn mints corpse food online whatever the tier (CORPSE-FOOD)."
  - "dressFood lives in food.js so rot stages retexture in the pack."
  - "Shops always stock a fresh Campfire and 99 Rations, tier regardless (ENDLESS PROVISIONS, post-arc)."
dfu:
  - "Assets/Scripts/Game/UserInterfaceWindows/DaggerfallTavernWindow.cs"
tags:
  - "items"
  - "food"
  - "tavern"
  - "water"
  - "rest-gate"
  - "camps"
---

# Survival Items, Water Sources, Tavern Menus, and the Hard Rest Gate

`src/systems/survival/items.js` registers templates `530` to `540` and Campfire `541` (`registerCustomTemplates`), with icons via `vendorTextureStandIn` and `addVendorTextures` (`src/render/textureReplacement.js`). `startingProvisions` grants `2` Rations, a Waterskin, quarter-condition hood-up cloak and Shoes, half-worn Camping Equipment, and a Campfire; shops stock a Campfire and `99` Rations.

## Food, Water, and Tavern Menus

`dressFood` (`src/systems/survival/food.js`) retextures rot stages in the pack, and `corpseFoodOn` (`src/systems/survival/loot.js`) mints corpse food online on every tier. Water sources within `CAMP_REACH` (`3.2`) include flats `212` `[0, 2, 8, 9]`, flat `85` `[0]`, and models `41220` to `41222`.

Tavern menus (`src/systems/survival/tavernMenu.js`, `src/ui/tavernWindow.js`) key by region (`n`, `ne`, `se`, `s`, `b`, `o`) and climate name (`MENU_KEY_BY_CLIMATE`) by `menuTier` (`< 5` low, `< 13` mid, else high), with breakfast `06:00` to `10:00` (closed before `06:00`), `MEAL_WORTH` (`240`), `SOFT_DRINK_FATIGUE` (`5`), and `BLACKOUT_WAKE_HOUR` (`6`).

## Camps and Hard Rest Gate

Camps (`src/systems/survival/camp.js`, `src/systems/survival/camps.js`) set `TENT_MODEL` `41606`, `FIRE_MINUTES` `480`, `BY_FIRE_REACH` `4`, `CAMPS_PER_OWNER` `4`, and `CAMP_LIGHTS_MAX` `4` (`CAMP_LIGHT_REACH` `64`). `installSurvivalRestGate` (`src/systems/survival/rest.js`) registers cold and hot `RegisterPreventRestCondition` gates via `restBlock` (refusing freezing/deadly cold without fire or roof, and scorching anywhere); `duelStandIn` (`src/combat/duelCombat.js`) keeps PvP boons neutral.
