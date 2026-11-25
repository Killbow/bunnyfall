---
slug: "quest-share-shape-pause-hooks-and-rest-sync"
title: "Quest Share Shape Matching, Pause Load Hooks, and Dungeon Rest Sync"
domain: "quests"
kind: "subcard"
parent: "gate-beacon-seams-and-morrowind-hand-overview"
files:
  - "src/systems/quest/questShare.js"
  - "src/systems/quest/machine.js"
  - "src/systems/quest/task.js"
  - "src/systems/quest/person.js"
  - "src/ui/pauseDoor.js"
  - "src/ui/charSheetDoor.js"
  - "src/scenes/world.js"
  - "src/scenes/exterior.js"
  - "src/scenes/dungeonContext.js"
  - "src/systems/quest/onlineGuard.js"
  - "src/net/wire.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-09-26.md"
related:
  - "gate-beacon-seams-and-morrowind-hand-overview"
  - "online-coop-party-quest-trade-and-ally-cast"
  - "online-time-quest-delays-and-deadlines"
  - "online-coop-death-rest-and-room-lanes"
invariants:
  - "`shapeMismatch` (`src/systems/quest/questShare.js`, `src/systems/quest/machine.js`) compares the normalized output of `parseQuestShape` fed by `_readTaskHeader` (`task.js`) and `_assignHomeTown` (`person.js`)."
  - "`pauseMenuAct` and `pauseMenuHooks` (`src/ui/pauseDoor.js`) pass `routeKey` and `setPlayerPos` across `world`, `exterior`, and `dungeonContext` so loading a save from the character sheet places the player."
  - "In `src/systems/quest/onlineGuard.js`, quest `N0B10Y03` starts on player arrival with `delaySeconds: 10 * 60` and `lengthSeconds: 60 * 60` game seconds."
  - "The dungeon room host owns rest encounters: joiners request at most once per `REST_ASK_GAP_MS` (`20000` ms), and shared encounter corpses use container key `enc:<_encId>`."
traps:
  - "Encounter identity uses `_encId`; never reuse `_sh*` properties reserved for billboard shadow state."
  - "Rest encounter enemies ride the layout enemy frame and must stay within `FOES_FRAME_MAX` (`64 * 1024` in `src/net/wire.js`)."
dfu: []
tags:
  - "quest-share"
  - "pause-menu"
  - "guard-the-guild"
  - "rest-encounter"
---

# Quest Share Shape Matching, Pause Load Hooks, and Dungeon Rest Sync

In `src/systems/quest/questShare.js`, `src/systems/quest/machine.js`, `src/systems/quest/task.js`, and `src/systems/quest/person.js`, `shapeMismatch` compares the normalized output of `parseQuestShape`, fed by `_readTaskHeader` and `_assignHomeTown`, before accepting a shared quest payload. In `src/systems/quest/onlineGuard.js`, quest `N0B10Y03` starts its watch on player arrival (`delaySeconds: 10 * 60`, `lengthSeconds: 60 * 60` game seconds) rather than waiting for the classic `daily from` window, which online cycled only once every two real hours.

In `src/ui/pauseDoor.js` and `src/ui/charSheetDoor.js`, `pauseMenuAct` and `pauseMenuHooks` thread `routeKey` and `setPlayerPos` across `src/scenes/world.js`, `src/scenes/exterior.js`, and `src/scenes/dungeonContext.js` so loading a save from the character sheet places the player at the saved coordinates.

In `src/scenes/dungeonContext.js` and `src/net/wire.js`, the dungeon room host owns rest encounters. Joiners request an encounter at most once per `REST_ASK_GAP_MS` (`20000` ms), and shared encounter corpses use container key `enc:<_encId>`, where `LOOT_KEY_RE` accepts `loot`, `corpse`, `enc`, and `srch` keys. Encounter identity uses `_encId` (never `_sh*` billboard shadow fields), and rest encounter enemies ride the layout enemy frame within `FOES_FRAME_MAX` (`64 * 1024`).
