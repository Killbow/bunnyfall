---
slug: "player-death-kept-and-arrival-holds"
title: "Death Kept at Zero, Arrival Holds, and Enemy Fall Holds"
domain: "player"
kind: "overview"
parent: null
files:
  - "src/characters/playerEntity.js"
  - "src/scenes/frame/inputFrame.js"
  - "src/scenes/frame/motorFrame.js"
  - "src/scenes/world.js"
  - "src/scenes/worldModes.js"
  - "src/player/deathRespawn.js"
  - "src/player/motor.js"
  - "src/ui/deathScreen.js"
  - "src/characters/enemyMotor.js"
  - "src/characters/exteriorFoes.js"
  - "src/characters/cityGuards.js"
  - "src/world/wodSites.js"
  - "src/scenes/frame/sceneFrame.js"
  - "src/ui/enhancedPorts.js"
  - "src/trade/banking.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-30b.md"
related:
  - "water-exhaustion-drain-and-net-fatigue"
  - "quest-residence-marks-and-home-plaques"
  - "legacy-online-death-hold-and-revival"
  - "pixel-streaming-and-origin-shift"
  - "foraging-online-wait-and-profession-tools"
  - "come-sail-away-overview"
invariants:
  - "`hurtPlayer` (`src/characters/playerEntity.js`) triggers death only on the alive-to-zero transition (`wasAlive && entity.health === 0`), consulting `_avoidDeathHook` once before `hearDeath` and `_deathPresenter`."
  - "Every frame, `src/scenes/frame/inputFrame.js` calls `presentPlayerDeath(playerEntity)` when `shared.playerSpawned && health <= 0`, `worldMoveBusy()` is false, no `DeathScreen` holds `townTalk.overlay`, `modes.deathUp()` is false, and `successionOpen()` is false."
  - "`_seasonStraightening` latches inside `_teleportToPixel` before its first `await` and clears in `finally`; `motorFrame.js` holds the motor (`holdFrame`) whenever `_seasonStraightening`, `_seasonHoldKey`, or `_partyArrivalPending` is active."
  - "Hosts supply `groundStands: (x, z) => Number.isFinite(heightAt(x, z))`; an enemy over unbuilt terrain calls `EnemyAI.holdFrame()`, clearing `inSight`, `detected`, and `wouldBeSpawned`."
  - "`restoreFall` must run after the placement's `spawn`, which clears every motion state. Calling it earlier loses the saved fall, and a fall saved just above the ground would load as a safe landing."
traps:
  - "Service windows mounted directly into a host slot can cover the death overlay, so keep the per-frame `presentPlayerDeath` check in `inputFrame.js` and keep `setDeathListener` callbacks idempotent."
  - "World of Daggerfall camp enemies spawn with `placed: true` (`standWodAction`) and never distance-cull, relying on `holdFrame()` while terrain builds."
  - "`AvoidDeath` restores `Math.trunc(maxHealth * 0.1)`, yielding `0` when `maxHealth < 10`."
dfu: []
tags:
  - "death"
  - "respawn"
  - "streaming"
  - "enemy-ai"
  - "banking"
  - "come-sail-away"
---

# Death Kept at Zero, Arrival Holds, and Enemy Fall Holds

Player death presentation, streaming arrival motor holds, and enemy terrain waits coordinate across `src/characters/playerEntity.js`, `src/scenes/frame/inputFrame.js`, `src/scenes/frame/motorFrame.js`, and `src/characters/enemyMotor.js`.

- **Zero-health transitions and death presentation:** `hurtPlayer` (`src/characters/playerEntity.js`) triggers death only on the alive-to-zero transition (`wasAlive && entity.health === 0`), running `_avoidDeathHook` once (`Math.trunc(maxHealth * 0.1)`) before `hearDeath` and `_deathPresenter`. To recover if a window mounted into a host slot replaces `DeathScreen` (`src/ui/deathScreen.js`, `src/scenes/worldModes.js`), `src/scenes/frame/inputFrame.js` invokes `presentPlayerDeath(playerEntity)` whenever `shared.playerSpawned && health <= 0`, `worldMoveBusy()` is false, no `DeathScreen` holds `townTalk.overlay`, `modes.deathUp()` is false, and `successionOpen()` is false.
- **Arrival and enemy terrain holds:** `_seasonStraightening` latches inside `_teleportToPixel` (`src/scenes/world.js`, `src/player/deathRespawn.js`) before its first `await` and clears in `finally`; `motorFrame.js` holds `src/player/motor.js` (`holdFrame`) while `_seasonStraightening`, `_seasonHoldKey`, or `_partyArrivalPending` is active. Exterior enemies and guards (`src/characters/exteriorFoes.js`, `src/characters/cityGuards.js`), including `placed: true` camp spawns (`standWodAction` in `src/world/wodSites.js`), test `groundStands: (x, z) => Number.isFinite(heightAt(x, z))` and call `EnemyAI.holdFrame()`, clearing `inSight`, `detected`, and `wouldBeSpawned`.
- **Travel surf and regional banking:** `src/scenes/frame/sceneFrame.js` skips `csaDrawWaves()` during travel view, while `src/trade/banking.js` and `src/ui/enhancedPorts.js` keep offline deposits regional and fold online branches into one Empire account.
