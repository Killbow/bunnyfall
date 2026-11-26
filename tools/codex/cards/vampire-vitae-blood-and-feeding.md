---
slug: vampire-vitae-blood-and-feeding
title: "Vampire Vitae, Blood Quality, Feeding, and Thralls"
domain: systems
kind: subcard
parent: balance-arc-overview
files:
  - src/systems/vampire/bloodLaw.js
  - src/systems/vampire/vitae.js
  - src/systems/vampire/clanLaw.js
  - src/systems/vampire/thralls.js
  - src/systems/vampire/thrallLaw.js
  - src/world/skippedTime.js
  - src/systems/vampire/fedToday.js
  - src/saves/save.js
  - src/scenes/vampire/vampireFeed.js
  - src/systems/vampire/bloodlineLeaf.js
  - src/party/retinue.js
  - src/scenes/worldModes.js
  - src/ui/hoverPickersWorld.js
  - src/ui/vampire/bloodSightCard.js
  - src/ui/vampire/havenWindow.js
  - src/systems/questlines/quests/QLVA01.txt
  - src/ui/tutorialCatalogue.js
routes: []
tables: []
replacesBible: []
related:
  - balance-arc-lycanthropy-and-vampirism
  - online-time-lycanthropy-and-vampire-nights
  - lived-time-two-clocks-overview
  - quest-guide-herald-and-tracker
invariants:
  - "Vitae drains `VITAE_DRAIN_PER_DAY` (12) per own-clock day. `settle` drains the part of its window inside a skipped span (`skippedMinutesIn`) at `TRAVEL_DRAIN_MUL` (0.25), never below `TRAVEL_DRAIN_FLOOR` (25), and the rest at the full rate."
  - "Skipped spans are recorded in memory, never saved, at the RaiseTime seams (the ticker's `advance`, the online tick's `raiseMinutes`, and `advanceOwnMinutes`) and for offline ticks while `timeScale()` is above 1 (an accelerated journey). A load clears them. A long frame window with no raise (a background tab) is time played."
  - "`spendMindCloud` always lets an awakened vampire give the Kiss, spending whatever Vitae is left (0 allowed); the Beast's `KISS_SLIP` is the risk. Taking someone to the Haven uses strict `spendVitae`."
  - "`feedVampire` gives at least `BANE_FLOOR` (half) of a feed of 10 or more Vitae when the clan multiplier is above 0 and below half. Only the Thrafey drain (0.25) is that low, so it gives 30. Garlythi poor blood is `GARLYTHI_POOR` (0.6)."
  - "A blow feeds (`FEEDS.wound`) only when `playerWeaponHitEntity` gets `damage > 0` and the target bleeds (`marksBlood`): `blowFeedDamage` gives 0 for crystals and warded stand-ins, and an arrow on an arena rival is not dispatched, as a melee blow is not."
  - "A person is marked fed only after a feed happens (`onFed` after `feedVampire`, or a Take), per person (a sleeper's own id), never per house. The marks are saved on the curse entry as the optional `fedToday` (`{ day, ids }`, at most `FED_TODAY_MAX`); `restorePlayer` keeps only today's valid ids."
  - "`thrallRound` charges each day played (up to 7) and at most one day per skipped span; `LOYALTY_UNPAID` is 15."
traps:
  - "Spans are not saved: a save made just after a time skip, before `settle` runs, drains that skip at the full rate when loaded."
  - "The bloodline nag in `bloodlineLeaf.js` is shown in a quest box through `setBloodlineHost` (retinue.js), not only the HUD line."
  - "Static NPC plaques read blood through `staticFeedPerson` in worldModes.js, and `bloodHoverLine` adds the scouting bonus, so the plaque matches the Blood Sight card."
tags:
  - vampire
  - vitae
  - blood
  - thralls
---

An awakened vampire (`awakenedVampirism`) lives on Vitae, 0 to 100, which sets the Beast's stage: Sated from 70, Thirsty from 45, Hungry from 25, Ravenous from 10, and Starving below 10.

Blood has a type (Scholar, Warrior, Rogue, Noble, Worker, or Beast) and a quality percent. `bloodTag` words it as "Noble blood, good (72%)" with one vocabulary (thin, fair, good, rich, and potent) on the plaque, the Blood Sight card, and the HUD chip. Resonance tiers start at 25, 50, 75, and 95 percent, and quality fades 10 a day.

Feeding in Steal mode offers the Kiss, Drink, and Drain, and Take or Enthrall when allowed. Pages for a new vampire live in the `vampire` group of `tutorialCatalogue.js` and pop through `noteFirstUse` (`vampire-bitten` only while the expansion is on, `-awakened`, `-blood`, `-gift`, `-feeding`, and `-thralls`).
