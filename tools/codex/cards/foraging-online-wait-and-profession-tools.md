---
slug: foraging-online-wait-and-profession-tools
title: "Foraging Online: Wait Window, Profession Tools, Console Refusal"
domain: systems
kind: subcard
parent: foraging-mod-overview
files:
  - src/professions/foragingWait.js
  - src/travel/foragingWorld.js
  - src/ui/waitWindow.js
  - src/systems/quest/questActionsExtension.js
  - src/systems/quest/questsWorld.js
  - src/professions/foragingInstall.js
  - src/professions/gatherHost.js
  - server-account/src/profHarvest.js
routes:
  - /v1/prof/harvest
tables:
  - node_harvests
replacesBible:
  - "06-Systems/Foraging.md"
related:
  - foraging-mod-overview
  - professions-gathering-nodes-and-motherlodes
  - online-waits-overview
invariants:
  - "Online (`sharedClockOn()`), QAE `raise time by` calls `waitOnline`, which calls `foragingWait.add` and never moves the shared clock. Pace is `WAIT_PER_HOUR` = 8 real seconds per game hour (`waitRealSeconds`)."
  - "A wait built during play sums every add without truncation. `saneWait` clamps a saved record to `FORAGING_WAIT_MAX_SECONDS` (8 game hours, 64 s) and `FORAGING_WAIT_HELD_MAX` (16) held boxes."
  - "The page opens only when the overlay slot is free. A nearby enemy (rest test, including an active duel) or a window taking the slot ends it and forgives the remainder. Held quest boxes are then released in order."
  - "ANY-HOUR: `foragingActRefusal` always skips 'daylight' for profession acts, and the service harvest check keeps no hours. Offline Foraging Use keeps the 07-17 day."
traps:
  - "Offline `tick()` forgives any pending wait loaded from an online save."
  - "CHOP-WAIT: `release()` runs only the boxes held when it began, and `holds()` is false while releasing. Breaking either rule hangs the tab in a box ping-pong loop."
  - "Online with professions open, the Wood-Axe, Pick-Axe, Sickle, Basket and Fishing-Net Use calls `professionUse` (a node act), or else shows the `PROFESSION_TOOL_HOW` line with no yield, quest or wear. The Spade stays Foraging-only."
dfu: []
tags:
  - foraging
  - online
  - wait-window
  - professions
  - console
---

# Foraging Online: Wait Window, Profession Tools, Console Refusal

Online play (`sharedClockOn()`) routes Foraging waits into a real-time overlay (`src/professions/foragingWait.js`, `src/travel/foragingWorld.js`, and `src/ui/waitWindow.js`) and binds five tools to world gathering nodes (`src/professions/gatherHost.js` and `server-account/src/profHarvest.js` over `/v1/prof/harvest` and `node_harvests`).

- **Online Wait Window**: In `src/systems/quest/questActionsExtension.js` and `src/systems/quest/questsWorld.js`, `raise time by` calls `waitOnline` -> `foragingWait.add` at `WAIT_PER_HOUR = 8` real seconds per game hour (`waitRealSeconds`) without advancing the shared clock. Live play sums added waits without truncation, whereas `saneWait` clamps saved `foragingWait` (`{ seconds, label, held }`) records to `FORAGING_WAIT_MAX_SECONDS` (64 s, 8 game hours) and `FORAGING_WAIT_HELD_MAX` (16) held boxes.
- **Interruption and Release (CHOP-WAIT)**: The wait overlay opens only when the UI slot is free. Nearby enemies (including duel enemies) or another window claiming the slot ends the wait and forgives the remainder; offline `tick()` also forgives waits loaded from online saves. `release()` snapshots held boxes and sets `holds()` to false while draining them in order.
- **Profession Tools and ANY-HOUR**: Online with professions open, using a Wood-Axe, Pick-Axe, Sickle, Basket, or Fishing-Net runs `professionUse` on a node or shows `PROFESSION_TOOL_HOW` without yield, quest, or wear; the Spade stays Foraging-only. Profession hosts (`fishHost`, `herbHost`, `mineHost`, `treeHost`, and `huntHost`) reuse `foragingToolIn`, `foragingActRefusal` / `actChecksRefusal` (skipping `'daylight'` under ANY-HOUR), and `wearForagingTool`.
- **Console Command**: `Foraging_Tools` (`foragingToolsCommand` in `src/professions/foragingInstall.js`) gives all six tools offline, answers `'Foraging Tools are not given online.'` online, and hides behind `gateConsoleCommand` (`'Command FORAGING_TOOLS not found.'`) when disabled.
