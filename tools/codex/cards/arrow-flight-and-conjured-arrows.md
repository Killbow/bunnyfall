---
slug: arrow-flight-and-conjured-arrows
title: Arrow Flight and Conjured Arrows
domain: combat
kind: overview
files:
  - src/combat/arrowFlight.js
  - src/magic/spellcast.js
  - src/items/inventory.js
  - src/items/itemTransfer.js
invariants:
  - "Player bow arrows originate 0.11 down camera-up and 0.15 toward the bow hand via playerArrowOrigin, unless playerShotOrigin receives an explicit muzzle offset."
  - "ArrowFlight.update scales raycast missileReach by |dir| plus MISSILE_COLLIDER_RADIUS along the normalized vector so crouch-dipped shots cannot tunnel."
  - "spendArrow and spendAmmoFor consume the shortest-lived conjured stack first, skip quest arrows, and block summoned-item transfers."
traps:
  - "Conjured arrows share the Weapon arrow template with permanent ammo; stacksWith and splitStack isolate conjured stacks by timeForItemToDisappear."
  - "Player arrows fly at ARROW_FLIGHT_SPEED (1.35 * MISSILE_SPEED) rather than the 25.0 speed used by spell missiles."
dfu:
  - Assets/Scripts/Game/WeaponManager.cs
  - Assets/Scripts/Game/DaggerfallMissile.cs
  - Assets/Scripts/Game/Items/ItemCollection.cs
tags:
  - arrows
  - archery
  - missiles
  - conjured-items
  - dfu-parity
---

# Arrow Flight and Conjured Arrows

Exterior, interior, and dungeon bow shots share missile origin, sweep, and ammo rules across `src/combat/arrowFlight.js`, `src/magic/spellcast.js`, and `src/items/inventory.js`.

- **Spawn offset:** `playerShotOrigin` calls `playerArrowOrigin` (`DaggerfallMissile.GetAimPosition`), shifting player arrows `0.11` down along camera-up (`PLAYER_ARROW_DOWN`) and `0.15` toward the bow hand (`PLAYER_ARROW_SIDE`, negated when left-handed). Passing an explicit `muzzle` offset routes through `playerMuzzleOrigin` instead.
- **Step raycast and speed:** `ArrowFlight.update` steps shafts at `ARROW_FLIGHT_SPEED` (`1.35 * MISSILE_SPEED`, an intentional balance departure over `25.0` spell speed) and casts `missileReach` (`step * |dir| + MISSILE_COLLIDER_RADIUS`) along the normalized vector so crouch-dipped shots (`|dir| > 1`) never tunnel.
- **Real vs. conjured recovery:** Real player arrows embed into world loot piles (`stickable`, `STUCK_ARROWS_MAX = 40`) and lodge in struck enemies at `ARROW_LODGE_CHANCE` (`0.5`). Summoned arrows (`isSummoned` via `timeForItemToDisappear`) vanish on impact.
- **Conjured stack rules:** `spendArrow` and `spendAmmoFor` pass `priorityToConjured: true` (`getItem`), spending the conjured stack with the shortest remaining lifetime first and skipping quest arrows. `stacksWith` and `splitStack` isolate conjured stacks by expiry timestamp, and `src/items/itemTransfer.js` refuses transferring summoned items.
