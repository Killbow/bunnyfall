---
slug: quest-engine-tick-tasks-and-tombstones
title: "Quest Tick, Task Triggers, Popups, and Tombstones"
domain: quests
kind: subcard
parent: quest-engine-overview
files:
  - src/systems/quest/machine.js
  - src/systems/quest/quest.js
  - src/systems/quest/task.js
  - src/systems/quest/questBridge.js
  - src/systems/quest/foe.js
  - src/systems/quest/actions.js
  - src/systems/quest/noAsksAgain.js
  - src/world/gameDate.js
  - src/magic/hostMagic.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Arc.md"
related:
  - quest-engine-overview
  - online-time-quest-delays-and-deadlines
  - quest-engine-resources-clicks-and-hud
invariants:
  - "TICKS_PER_SECOND = 10 (machine.js:324). The bridge fires on real time and resets its timer to zero on fire (questBridge.js:649-654)."
  - "Tombstoned quests are removed once nowSeconds - questTombstoneTime > SECONDS_PER_WEEK (7*86400, gameDate.js)."
  - "In a task, the first always-on trigger is PRIMARY (starts and stops the task). Later ones only start it (task.js)."
  - "Aborting a readied spell (`abortReadySpell` in `src/magic/hostMagic.js`) raises neither `onNewReadySpell` nor `onCastReadySpell`, so the quest machine latches on those two events instead of polling."
traps:
  - "Popup message chunking splits on `++lineCount > 22` (`src/systems/quest/quest.js`), yielding `23` lines per popup chunk."
  - "`CreateFoe` (`src/systems/quest/actions.js`) backdates its initial spawn by `Random.Range(0, spawnInterval)` with no zero guard, and `src/systems/quest/foe.js` clamps spawn counts to `1..MAX_SPAWN_COUNT` (`8`)."
dfu:
  - "Assets/Scripts/Game/Questing/Quest.cs"
  - "Assets/Scripts/Game/Questing/Task.cs"
  - "Assets/Scripts/Game/Questing/QuestMachine.cs"
tags:
  - quests
  - tick
  - tasks
  - tombstone
  - enemy-spawn
  - time
---

# Quest Tick, Task Triggers, Popups, and Tombstones

Quest execution runs on a 10 Hz real-time tick that evaluates task trigger semantics, popup pagination, enemy spawn intervals, and seven-day tombstone expiry.

- **Tick Cadence, Clocks, and Tombstones (`src/systems/quest/machine.js`, `src/systems/quest/quest.js`, `src/systems/quest/questBridge.js`, `src/world/gameDate.js`):** `TICKS_PER_SECOND = 10` in `src/systems/quest/machine.js`, and `src/systems/quest/questBridge.js` fires on real time while resetting its timer to zero on fire and exposing `skySeconds` and `worldSeconds` alongside `nowSeconds`. In `src/systems/quest/quest.js`, `Quest.update` decrements `ticksToEnd` and sets `questComplete` at zero. Tombstoned quests remain for one week and are purged once `nowSeconds - questTombstoneTime > SECONDS_PER_WEEK` (`7 * 86400` in `src/world/gameDate.js`).
- **Task Triggers, Popup Chunks, and Enemy Spawns (`src/systems/quest/task.js`, `src/systems/quest/quest.js`, `src/systems/quest/actions.js`, `src/systems/quest/foe.js`, `src/systems/quest/machine.js`):** In `src/systems/quest/task.js`, the first always-on trigger in a task is `PRIMARY` (both starting and stopping the task), while later triggers only start it. Popup message pagination in `src/systems/quest/quest.js` splits on `++lineCount > 22`, producing `23` lines per chunk. For enemy waves, `CreateFoe` (`src/systems/quest/actions.js`) backdates initial spawns by `Random.Range(0, spawnInterval)` with no zero guard, `src/systems/quest/foe.js` clamps counts to `1..MAX_SPAWN_COUNT` (`8`), and `FOE_STANDS_TICKS` is `5 * 60 * TICKS_PER_SECOND`.
