---
slug: quest-load-set-aside-and-faction-wait
title: "Quest Restore: Set-Aside Quests and the Faction Wait"
domain: quests
kind: subcard
parent: quest-engine-overview
files:
  - src/systems/quest/machine.js
  - src/world/worldSaveLoad.js
  - tools/questRestoreSafe.test.mjs
routes: []
tables: []
replacesBible: []
related:
  - quest-engine-overview
  - quest-engine-tick-tasks-and-tombstones
invariants:
  - "A quest that throws in QuestMachine.restoreSaveData is pushed to machine.unrestored as saved, written back in getSaveData as `unrestored`, and retried first at the next load. The rest of the save loads."
  - "worldQuickLoad awaits townTalk.ensureLoaded() before restoreSessionState, because Person.restoreSaveData reads FACTION.TXT through the world hook."
traps:
  - "Without that wait, a load straight from the boot restored quests before FACTION.TXT was read, and every quest holding a Person with a faction id failed with the HUD line about a removed quest mod (found 2026-11-25)."
  - "clearState empties unrestored, so a quicksave after a failed load still carries the set-aside quests only until the next full load clears them."
tags:
  - quests
  - save
  - load
---

# Quest Restore: Set-Aside Quests and the Faction Wait

Each saved quest restores under its own catch in `machine.js`. One that cannot rebuild (unknown action or resource type, unknown Person faction, duplicate UID) says so on the HUD and is kept whole in `unrestored`, so its progress is never dropped and a later build that knows the type takes it back.

A Person restores its faction from the live store, which is `townTalk.factionDict`, read from FACTION.TXT on its own timer. `worldSaveLoad.js` waits for that read before the quests restore.
