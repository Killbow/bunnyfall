---
slug: online-waits-awaited-quest-waves
title: "Awaited Quest Waves: Short First Arrival Online"
domain: systems
kind: subcard
parent: online-waits-overview
files:
  - src/systems/quest/actions.js
  - src/systems/quest/clock.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Online-Waits.md"
related:
  - online-waits-overview
  - online-time-quest-delays-and-deadlines
  - quests-macros-and-main-spine
invariants:
  - "`waveIsAwaited(quest, foeName)` (clock.js) is true only when a `KilledFoe` trigger on that enemy reaches, through a positive `when`, a Prompt or a settling action such as a reward, TrainPc or the next quest. `injured` readers are ignored."
  - "`CreateFoe._firstArrivalSeconds()` returns `Math.min(spawnInterval, ONLINE_DELAY_SECONDS)` only when `questWaitsShort` holds, the wave is awaited, `spawnCounter === 0`, `_arrived` is false and the enemy's `killCount` is 0. Otherwise it returns `spawnInterval`."
  - "The first-update backdate stays a single unconditional `_range(first)` draw, so the quest's roll stream is not shifted."
  - "`ONLINE_DELAY_SECONDS = 24 * 60` (24 character minutes, about two real minutes of play)."
traps:
  - "Until the first arrival, `lastSpawnTime` is clamped each tick (outside `spawnInProgress`) so a failed roll, a hidden enemy, a wave kept off or a wave lost in flight never pushes the wave past the short wait (AUDIT WAITS W7)."
  - "A re-set re-arms the wave whole (`InitialiseOnSet`, for example N0B20Y02's guard stepping out). 'Has come' must outlive that through `spawnCounter`, `_arrived` and `Foe.killCount`, or the short wait would repeat (AUDIT WAITS W3)."
  - "`_awaited` is transient and read once. Waves after the first, and unawaited harasser waves, keep the script interval."
dfu:
  - Assets/Scripts/Game/Questing/Actions/CreateFoe.cs
tags:
  - quests
  - waves
  - enemy-waves
  - online
  - wave-wait
---

# Awaited Quest Waves: Short First Arrival Online

`src/systems/quest/clock.js` and `src/systems/quest/actions.js` shorten the first arrival of progression-blocking enemy waves online so quests with long `CreateFoe` intervals (such as `S0000021` at `1410` minutes and `N0B20Y02` Nightblades) do not stall behind unrestable clocks.

## Awaited Detection and First-Arrival Clamping

- **Graph reachability (`waveIsAwaited` in `src/systems/quest/clock.js`):** Evaluates `true` only when a `KilledFoe` trigger on the target enemy reaches, through a positive `when` condition, a Prompt or a settling action (reward, `TrainPc`, or next quest), ignoring `injured` readers. Across `241` corpus waves, `27` classify as awaited.
- **Short first window (`CreateFoe._firstArrivalSeconds` in `src/systems/quest/actions.js`):** Returns `Math.min(spawnInterval, ONLINE_DELAY_SECONDS)` (`ONLINE_DELAY_SECONDS = 24 * 60`, or 24 character minutes, about two real minutes) only when `questWaitsShort` is active, the cached transient `_awaited` flag is true, `spawnCounter === 0`, `_arrived` is `false`, and the target `Foe` resource has `killCount === 0`. Subsequent waves, offline sessions, and unawaited harasser waves use `spawnInterval` with the standard `Range(0, interval)` backdate.
- **RNG preservation and tick clamping:** The initial backdate always performs a single unconditional `_range(first)` draw to preserve the quest roll stream. Until the first arrival lands, `lastSpawnTime` is clamped every tick outside `spawnInProgress` (`AUDIT WAITS W7`), and re-arming via `InitialiseOnSet` preserves first-arrival history across `spawnCounter`, `_arrived`, and `Foe.killCount` (`AUDIT WAITS W3`).
