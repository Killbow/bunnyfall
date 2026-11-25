---
slug: quest-engine-overview
title: "Quest Engine: the DFU QuestMachine Port"
domain: quests
kind: overview
parent: null
files:
  - src/systems/quest/machine.js
  - src/systems/quest/quest.js
  - src/systems/quest/task.js
  - src/systems/quest/parser.js
  - src/systems/quest/actions.js
  - src/systems/quest/questBridge.js
  - src/systems/quest/questLists.js
  - src/systems/quest/offerFlow.js
  - vendor/dfu-quests/README.md
routes: []
tables: []
replacesBible:
  - "06-Systems/Quest-Arc.md"
related:
  - quest-engine-parse-and-action-templates
  - quest-engine-tick-tasks-and-tombstones
  - quest-engine-resources-clicks-and-hud
  - quests-macros-and-main-spine
  - quest-guide-arc-overview
  - online-time-quest-delays-and-deadlines
invariants:
  - "Quest scripts and tables load from vendor/dfu-quests (265 files in Quests/, Quests-*.txt plus QuestList-*.txt in Tables/). No ARENA2 or network fetch is needed."
  - "PROTECTED_QUESTS = ['S0000999', 'S0000977', '_BRISIEN'] in machine.js are never treated as ordinary restartable quests."
  - "Hosts reach the machine only through createQuestBridge(ctx) in questBridge.js."
traps:
  - "Bridge and host files live in src/systems/quest/, not src/scenes/quest/."
dfu:
  - "Assets/Scripts/Game/Questing/QuestMachine.cs"
  - "Assets/Scripts/Game/Questing/QuestListsManager.cs"
tags:
  - quests
  - dfu-parity
  - quest-machine
  - overview
---

# Quest Engine: the DFU QuestMachine Port

The quest engine ports Daggerfall Unity quest execution into `src/systems/quest/`, loading all scripts and tables from `vendor/dfu-quests` without `ARENA2` files or network fetches.

- **Machine, Quests, and Tasks (`src/systems/quest/machine.js`, `src/systems/quest/quest.js`, `src/systems/quest/task.js`):** `QuestMachine` owns active quests, site links, global variables, and the main tick, while `Quest` and `Task` mirror `Quest.cs` and `Task.cs`. In `src/systems/quest/machine.js`, `PROTECTED_QUESTS = ['S0000999', 'S0000977', '_BRISIEN']` prevents core backbone scripts from being treated as ordinary restartable quests.
- **Bundled Scripts and Quest Lists (`src/systems/quest/parser.js`, `src/systems/quest/actions.js`, `src/systems/quest/questLists.js`, `vendor/dfu-quests/README.md`):** The corpus ships `265` quest scripts in `Quests/` alongside `Quests-*.txt` and `QuestList-*.txt` in `Tables/`. `src/systems/quest/questLists.js` reads the list tables, including `188` non-comment rows in `QuestList-Classic.txt`.
- **Host Bridge and Offer Flow (`src/systems/quest/questBridge.js`, `src/systems/quest/offerFlow.js`):** World and exterior hosts access the machine exclusively through `createQuestBridge(ctx)` (located in `src/systems/quest/`, not `src/scenes/quest/`), which wires quest lists, the notebook, and `GAME_START_QUESTS` (gated on `contentOn`). `src/systems/quest/offerFlow.js` runs social and guild offers, and `questBridge.offerBoxes` renders Yes/No offer dialog boxes. See `quest-engine-parse-and-action-templates`, `quest-engine-tick-tasks-and-tombstones`, and `quest-engine-resources-clicks-and-hud` for parsing, tick scheduling, and resource behavior.
