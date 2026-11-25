---
slug: horse-care-keep-stables-and-yards
title: "Horse Keep Tick, Stable Care Cards, and Stable Yards"
domain: world
kind: subcard
parent: horse-care-tiers-overview
files:
  - src/travel/steedCare.js
  - src/systems/upkeep/upkeepRuntime.js
  - src/systems/upkeep/upkeepItemRows.js
  - src/world/merchantYards/merchantYards.js
  - src/ui/holdingsPages.js
  - src/ui/enhancedSaddle.js
  - src/travel/horseFollow.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Care.md"
related:
  - horse-care-tiers-overview
  - horse-care-stats-bond-and-hunger
  - holdings-stable-and-transport-stabling
invariants:
  - "tendHorses handles three places (STEED_WHERE): 'with' eats oats from the pack, then the wagon load, each time the clock runs out across a skipped span of at least SKIP_MINUTES 60; 'waiting' grazes (held at Hungry, never Starving); 'stabled' is topped up to STABLE_FED 12h whenever it falls under 6h."
  - "The Stable page lists every owned horse on every tier. With care Off the horse cards and the 'Ride this one' button (chooseRiddenHorse) stay, and only the care metrics and feed buttons hide."
  - "UPKEEP_ITEMS_ONLINE is true, so online Stables sell oats (YARD_OATS_STACK 20)."
traps:
  - "Stable offerings and horse items are shared town data. Only what the player horse pays is player-local."
  - "A fade owed before `since` is taken only up to `since` for stabled and grazing horses, so indoor spans never starve them retroactively."
dfu: []
tags:
  - horse
  - stable
  - keep
  - merchant-yards
  - oats
---

# Horse Keep Tick, Stable Care Cards, and Stable Yards

`tendHorses` (`src/travel/steedCare.js`) and `upkeepRuntime.js` advance feeding clocks across owned mounts by location (`STEED_WHERE`), while UI panels and stable yards expose selection, feeding, and buying.

- **Keep rules by location (`src/travel/steedCare.js`, `src/travel/horseFollow.js`):** A horse traveling `'with'` the player eats oats from the pack and then the wagon across time skips of at least `SKIP_MINUTES` (`60`) when its food clock expires. A `'waiting'` horse outside an interior or dungeon grazes so it is held at Hungry and never reaches Starving, while hitched mounts catch up at `HITCH_JUMP_SPEED` (`30`). A `'stabled'` horse tops up to `STABLE_FED` (`12` hours) whenever its clock drops under `6` hours. Any bond fade owed before `since` is taken only up to `since` for grazing and stabled horses so indoor spans never starve them retroactively.
- **Stable page and Saddle panel (`src/ui/holdingsPages.js`, `src/ui/enhancedSaddle.js`):** The Stable page lists every owned horse on all tiers. Clicking `'Ride this one'` calls `chooseRiddenHorse`, moving the picked horse first in the pack as the ridden mount and wagon lead. Turning care Off hides only care meters and feed buttons (`'Feed oats (n)'` and the apple action), which the Saddle panel also reuses when care is enabled.
- **Stable yards (`src/world/merchantYards/merchantYards.js`, `src/systems/upkeep/upkeepItemRows.js`):** Exterior stable yards offer `STABLE_HORSES_OFFERED` (`3`) daily horses seeded by town, day, and stall, priced at `steedValue = max(400, round(1000 * (1 + (meanBorn - 50) / 50)))`, plus oat stacks (`YARD_OATS_STACK` `20`, enabled online by `UPKEEP_ITEMS_ONLINE`).
