---
slug: arrow-supply-stuck-and-lodged-arrows
title: "Stuck Arrow Piles and Enemy Lodging"
domain: combat
kind: subcard
parent: arrow-supply-overview
files:
  - src/combat/arrowFlight.js
  - src/items/droppedLoot.js
  - src/items/foeLootCap.js
  - src/combat/hostCombat.js
  - src/combat/shotTally.js
  - src/items/inventory.js
  - src/scenes/dungeonContext.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/scenes/worldModes.js
  - src/characters/exteriorFoes.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Arrow-Supply.md"
related:
  - arrow-supply-overview
  - arrow-flight-and-conjured-arrows
  - loot-arc-drop-rates-renown-and-loot-lines
invariants:
  - "stickable(m) = `fromPlayer` is true while `visual`, `summoned`, and `shotTallyOpen()` are false; enemy shafts, peer echoes, conjured rounds and arena-bout shafts never stick."
  - "stickArrow seeds a pile via droppedLoot.seedPile with { unsaved: true, drawn: false, owner: 'stuckArrow' }, label 'Arrow', noStore = STUCK_ARROW_NO_STORE; the pool keeps STUCK_ARROWS_MAX = 40, removing the oldest."
  - "unsaved piles (WOD5 LoadID 0) are excluded from droppedLoot snapshots and saves."
  - "capLootList keeps quiver arrows (isQuiverArrow) outside the plain-enemy item cap."
traps:
  - "STUCK_ARROW_LIFT is 0.3 (half the 0.6-tall pile box), not 0.6: the pile sits 0.3 below the struck point and the shaft is drawn back up by it."
  - "The lodge roll is evaluated last on the attack's roll stream so earlier damage rolls keep their sequence."
  - "In dungeons syncStuckArrowDraws must run before updateMissiles' no-missile early return, or stuck shafts vanish when nothing is flying."
dfu:
  - Assets/Scripts/Game/DaggerfallMissile.cs
  - Assets/Scripts/Game/WeaponManager.cs
tags:
  - stuck-arrows
  - arrow-lodge
  - dropped-loot
  - drop-cap
  - puppets
---

# Stuck Arrow Piles and Enemy Lodging

Real player arrows that strike geometry or enemies either seed temporary stuck-arrow piles or roll to lodge in enemy loot (`src/combat/arrowFlight.js`, `src/items/droppedLoot.js`, and `src/items/foeLootCap.js`).

- **Stuck arrow piles:** `spendAmmoFor` (`src/items/inventory.js`) sets `shot.summoned`, forwarded by `fireArrow` in `src/scenes/world.js`, `src/scenes/exterior.js`, `src/scenes/worldModes.js`, and `src/scenes/dungeonContext.js`. `stickable(m)` requires `fromPlayer` with `visual`, `summoned`, and `shotTallyOpen()` (`src/combat/shotTally.js`) all `false`. `stickArrow` calls `droppedLoot.seedPile` with `{ unsaved: true, drawn: false, owner: 'stuckArrow' }`, label `'Arrow'`, and `noStore = STUCK_ARROW_NO_STORE`, capped at `STUCK_ARROWS_MAX` (`40`, evicting the oldest). Because `STUCK_ARROW_LIFT` is `0.3` (half the `0.6` pile box), the pile sits `0.3` below the hit point while the mesh draws back up at the impact point. `stuckArrowSetBack(bounds)` computes `cz + r - STUCK_ARROW_EMBED * 2r` (`STUCK_ARROW_EMBED = 0.25`) to embed a quarter of the `99800` (`ARROW_MODEL_ID`) shaft, and `stuckArrowMatrix` reads `pile.pos` live across `offsetAll` origin shifts. `unsaved` piles (`WOD5` `LoadID 0`) never enter saves. `src/scenes/world.js` passes `pixelKeyAt` for `collectPixel` cleanup, `pruneStuckArrows` clears emptied piles, and `src/scenes/dungeonContext.js` runs `syncStuckArrowDraws` before the empty-list early return in `updateMissiles`.
- **Enemy lodging and loot cap:** Real player arrows roll `ARROW_LODGE_CHANCE` (`0.5`) last on the attack roll stream (`src/combat/hostCombat.js`, `src/characters/exteriorFoes.js`), peer-owned puppets add `bowDamageArrow` when a hit frame carries `ar === 1` up to `HIT_ARROWS_MAX` (`255` in `src/net/wire.js`), and `capLootList` (`src/items/foeLootCap.js`) keeps `isQuiverArrow` outside the plain-enemy cap.
