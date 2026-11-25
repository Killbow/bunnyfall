---
slug: "dropped-and-thrown-torch-pool"
title: "Dropped Light Pool, Thrown Torch Flight, and Burning Enemies"
domain: "items"
kind: "subcard"
parent: "handheld-torches-overview"
files:
  - "src/items/droppedTorches.js"
  - "src/combat/formulas.js"
  - "src/player/activate.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Handheld-Torches.md"
related:
  - "handheld-torches-overview"
  - "handheld-torches-hand-law-and-keys"
  - "enhanced-lighting-clusters-light-ids-and-pools"
  - "realm-saves-and-mod-save-hooks"
invariants:
  - "Dropped billboards use TEXTURE.112358 records Torch 0, Candle 1 and HolyCandle 2, plus DousedOffset 10 when doused."
  - "Dropped light point range equals `1 + template.capacityOrTarget * (time / fullBurn)` at `pos.y + Math.abs(height) / 2 + LIGHT_ABOVE_BILLBOARD` (`0.5`), unscaled by `PlayerTorchLightScale`."
  - "Burn time advances with world minutes by subtracting `(now - lastMinutes) * 60 / 12` seconds per tick (`12:1` time scale), aging dropped lights across rest, loiter, and wait."
  - "The pool clock re-latches in restore, in destroyAll (transition sweeps) and when the first light enters an empty pool, so a load never burns torches out."
  - "The projectile steps every PROJECTILE_FIXED_DT = 0.02 s. Gravity grows by -9.81 * gravityDrag per step. Sprite width is sin(20t). The rest threshold is 0.2 of start speed, and the drop clip plays at most every 0.2 s."
  - "With Throwing.Combustion on, a struck enemy turns hostile and calculateSuccessfulHit rolls with Throwing.Accuracy. A landed hit applies ContinuousDamage-Health and shows the TEXTURE.375 record 0 flame at 15 fps."
  - "Save data (HandheldTorchesSaveData) is the list of { position, time, itemTemplateIndex } built by snapshot and respawned by restore."
traps:
  - "Upstream `ContinuousDamageHealth` omits `SupportChance`, so `Throwing.Chance` is ignored and every landed combustion hit ignites."
  - "Torch template record index is `0`; `restore` must test for `null`/`undefined` rather than truthiness, and online burn follows the shared world clock."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/Effects/Destruction/ContinuousDamageHealth.cs"
  - "Assets/Scripts/Game/Formulas/FormulaHelper.cs"
  - "Assets/Scripts/Game/Utility/DaggerfallDateTime.cs"
tags:
  - "handheld-torches"
  - "dropped-lights"
  - "projectile"
  - "combustion"
  - "save-data"
---

# Dropped Light Pool, Thrown Torch Flight, and Burning Enemies

`createDroppedTorches` in `src/items/droppedTorches.js` manages dropped billboards, thrown torch projectiles, enemy combustion, and save persistence, with player pickup dispatched from `src/player/activate.js` within `PICKUP_REACH = 3.2`.

- **Billboards, range, and clock:** Dropped lights use `TEXTURE.112358` records `0` (Torch), `1` (Candle), and `2` (HolyCandle), adding `DousedOffset = 10` when doused. Point-light range equals `1 + template.capacityOrTarget * (time / fullBurn)` at `pos.y + Math.abs(height) / 2 + LIGHT_ABOVE_BILLBOARD` (`0.5`), ignoring `PlayerTorchLightScale`. Burn time subtracts `(now - lastMinutes) * 60 / 12` seconds per world-minute tick (`12:1` scale) across rest, loiter, wait, and shared online clocks. The clock re-latches on `restore`, `destroyAll`, and first entry into an empty pool.
- **Projectiles, combustion, and saves:** Projectiles step at `PROJECTILE_FIXED_DT = 0.02` s (`-9.81 * gravityDrag`, width `sin(20t)`, rest threshold `0.2` of initial speed, drop audio cooldown `0.2` s). When `Throwing.Combustion` is active, a struck target turns hostile and `calculateSuccessfulHit` (`src/combat/formulas.js`) rolls with `Throwing.Accuracy`; every landed hit applies `ContinuousDamage-Health` (`ENEMY_LIGHT_EFFECT_KEY = 'HandheldTorchesEnemyLight'`, `PUFF` archive `375` record `0` at `15` fps) because `ContinuousDamageHealth` omits `SupportChance`. `HandheldTorchesSaveData` serializes `{ position, time, itemTemplateIndex }`, checking `null` or `undefined` so record `0` restores cleanly.
