---
slug: arrow-supply-overview
title: "Arrow Supply: Stuck, Lodged, Fletched, and Shop Arrows"
domain: combat
kind: overview
parent: null
files:
  - src/combat/arrowFlight.js
  - src/professions/fletching.js
  - src/trade/shopStock.js
  - src/items/foeLootCap.js
  - src/combat/enemyEquipment.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Arrow-Supply.md"
related:
  - arrow-supply-stuck-and-lodged-arrows
  - arrow-supply-fletching-and-shop-quivers
  - arrow-flight-and-conjured-arrows
  - market-vendors-and-professions
  - loot-arc-overview
invariants:
  - "Every recovered or crafted arrow is minted by bowDamageArrow or createWeapon(ARROW_TEMPLATE, ...) in src/combat/enemyEquipment.js, never a bare item literal."
  - "Conjured shafts (shot.summoned, DFU isArrowSummoned) never stick and never lodge."
traps:
  - "The arc has four slices (STUCK-ARROWS, ARROW-LODGE, FLETCH, SHOP-ARROWS); ENDLESS-ARROWS and PELLETS-SCARCE later overrode parts of SHOP-ARROWS."
dfu:
  - Assets/Scripts/Game/DaggerfallMissile.cs
  - Assets/Scripts/Game/WeaponManager.cs
tags:
  - arrows
  - archery
  - ammo
  - dfu-departure
  - economy
---

# Arrow Supply: Stuck, Lodged, Fletched, and Shop Arrows

Arrow recovery, field crafting, and counter quivers span four slices (`STUCK-ARROWS`, `ARROW-LODGE`, `FLETCH`, and `SHOP-ARROWS`) across `src/combat/arrowFlight.js`, `src/professions/fletching.js`, `src/trade/shopStock.js`, `src/items/foeLootCap.js`, and `src/combat/enemyEquipment.js`. Later `ENDLESS-ARROWS` and `PELLETS-SCARCE` slices updated the `SHOP-ARROWS` rules.

- **Item minting and conjured shafts:** Every recovered or fletched arrow is minted through `bowDamageArrow` or `createWeapon(ARROW_TEMPLATE, ...)` in `src/combat/enemyEquipment.js`, never as a bare item literal. Conjured shafts (`shot.summoned`, matching DFU `isArrowSummoned`) vanish on impact without sticking in geometry or lodging in enemies.
- **World recovery (`STUCK-ARROWS` and `ARROW-LODGE`):** Unlike DFU `DaggerfallMissile.DoCollision`, which destroys a missile on impact, a real player arrow that hits world geometry remains as a single-arrow dropped-loot pile (`src/combat/arrowFlight.js`). When a real player arrow hits an enemy, it lodges in the target inventory at `ARROW_LODGE_CHANCE` (`0.5`, whereas DFU `BowDamage` in `WeaponManager.cs` keeps every arrow), and `capLootList` in `src/items/foeLootCap.js` exempts quiver arrows from the plain-enemy drop cap.
- **Field fletching and shop counters (`FLETCH` and `SHOP-ARROWS`):** Using `Twigs` (`8`), `Pine Branch` (`14`), or `Wood Bundle` (`1604`) converts wood weight at `0.25` kg per shaft into arrows (`src/professions/fletching.js`). Every weapon-selling shop stocks a deterministic counter quiver via `shopArrowStack` up to `SHOP_ARROWS_MAX` (`100` in `src/trade/shopStock.js`) without a random roll.
