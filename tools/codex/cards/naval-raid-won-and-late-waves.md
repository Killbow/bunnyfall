---
slug: naval-raid-won-and-late-waves
title: "Naval Boarding Raid Won: End Quest Grace and Late Waves"
domain: world
kind: subcard
parent: wallet-weight-glyphs-and-raid-lairs-overview
files:
  - src/systems/naval/navalHost.js
  - src/systems/naval/raidAshore.js
  - src/systems/naval/navalBoarding.js
  - src/systems/naval/warmAshesShips.js
  - src/systems/quest/quest.js
  - src/scenes/world.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-19.md"
related:
  - wallet-weight-glyphs-and-raid-lairs-overview
  - naval-plunder-prize-deeds-and-raid-gate
  - naval-ramming-and-grapple-boarding
  - naval-combat-overview
invariants:
  - "RAID-WON: winBoarding calls wonRaid(b.quest) on both repel branches, the second-wave branch and the final throw-back. wonRaid calls deps.board.endRaid(quest, { won: true })."
  - "raidAshore.won withdraws the quest's living enemies, including its `_ally_` crew Warriors, so they no longer count in areEnemiesNearby. It then calls quest.endQuest() without a break."
  - "Quest.endQuest sets ticksToEnd = 2, so the two grace ticks run and the victory event can fire."
  - "raidAshore.late withdraws a wave that lands after its raid has ended. This covers the ship deck and open ground (world.js) and below deck (worldModes.js, through host.raidLate)."
traps:
  - "leaveShipGate keeps the quest uid in raidUids until raidEnded. A Leave Ship during the grace ticks returns 'naval', never opening the prize window."
  - "If the player's ship is gone, leaveShipGate calls endBoarding() and then wonRaid(quest), and raidAshore.crew sends the crew home."
dfu: []
tags:
  - naval
  - raid
  - boarding
  - quest
---

# Naval Boarding Raid Won: End Quest Grace and Late Waves

Naval boarding and raid-ashore quests (`WA_RAID_QUESTS`: `WA_RAID_QUEST` and `'WAQ_SHIP_PIRATEATTACK'` in `src/systems/naval/warmAshesShips.js`) end through a two-tick quest grace window while withdrawing remaining crew and late waves.

## Winning the Raid and Running Grace Ticks

- **Repel and boarding victory (`src/systems/naval/navalHost.js`, `src/systems/naval/navalBoarding.js`):** `winBoarding` calls `wonRaid(b.quest)` on both repel branches (the second-wave repel and the final throw-back), forwarding `deps.board.endRaid(quest, { won: true })`. When `raidEnded` runs, it invokes `winBoarding` if `raidQuestWon` is true and `castOff` otherwise.
- **Enemy withdrawal and quest grace (`src/systems/naval/raidAshore.js`, `src/systems/quest/quest.js`):** `raidAshore.won` withdraws all living enemies belonging to the quest, including `_ally_` crew Warriors, so they no longer register in `areEnemiesNearby`. It then calls `quest.endQuest()` without a break, setting `ticksToEnd = 2` so the two grace ticks complete and fire the victory event.

## Leave Ship Gate and Late Wave Cleanup

- **Leave Ship gate (`src/systems/naval/navalHost.js`, `src/systems/naval/raidAshore.js`):** `leaveShipGate` keeps the quest UID in `raidUids` until `raidEnded`, so pressing Leave Ship during the two grace ticks returns `'naval'` rather than opening the prize window early. If the player's ship is gone, `leaveShipGate` calls `endBoarding()` and `wonRaid(quest)`, while `raidAshore.crew` sends the crew home.
- **Late wave withdrawal (`src/scenes/world.js`, `src/scenes/worldModes.js`):** `raidAshore.late` immediately withdraws any wave that spawns after its raid has ended, covering both the ship deck and open ground (`src/scenes/world.js`) and below-deck interiors (`src/scenes/worldModes.js` via `host.raidLate`).
