---
slug: vampire-vitae-blood-and-feeding
title: "Vampire Vitae, Blood Quality, Feeding and Thralls"
domain: systems
kind: subcard
parent: balance-arc-lycanthropy-and-vampirism
files:
  - src/systems/vampire/bloodLaw.js
  - src/systems/vampire/vitae.js
  - src/systems/vampire/clanLaw.js
  - src/systems/vampire/thralls.js
  - src/scenes/vampire/vampireFeed.js
  - src/systems/vampire/bloodlineLeaf.js
  - src/ui/tutorialCatalogue.js
routes: []
tables: []
replacesBible: []
related:
  - balance-arc-lycanthropy-and-vampirism
  - online-time-lycanthropy-and-vampire-nights
  - quest-guide-herald-and-tracker
invariants:
  - "Vitae drains `VITAE_DRAIN_PER_DAY` (20) per own-clock day. In `settle`, only the first `TRAVEL_SPAN_DAYS` (0.1) of one jump drains at full rate; the rest drains at `TRAVEL_DRAIN_MUL` (0.25) and never below `TRAVEL_DRAIN_FLOOR` (25)."
  - "`spendMindCloud` always lets an awakened vampire give the Kiss, spending whatever Vitae is left (0 allowed); the Beast's `KISS_SLIP` is the price."
  - "`feedVampire` gives at least `BANE_FLOOR` (half) of a feed of 10+ Vitae unless the clan's bane multiplier is exactly 0 (Anthotis on beast blood). Garlythi poor blood is `GARLYTHI_POOR` (0.6)."
  - "`FED_TODAY` marks a person only through `onFed`, after `feedVampire` ran: Leave never marks, and a feed is per person (a sleeper's own id), never per house."
  - "`thrallRound` pays at most one upkeep day per catch-up, so a journey never makes a thrall leave; `LOYALTY_UNPAID` is 15."
traps:
  - "The bloodline nag in `bloodlineLeaf.js` is shown in a quest box through `setBloodlineHost` (retinue.js), not only the HUD line."
  - "Static NPC plaques read blood through `staticFeedPerson` in worldModes.js, the same id the feed uses."
tags:
  - vampire
  - vitae
  - blood
  - thralls
---

An awakened vampire (`awakenedVampirism`) lives on Vitae, 0 to 100, which sets the Beast's stage: Sated from 70, Thirsty 45, Hungry 25, Ravenous 10, Starving 0.

Blood has a type (Scholar, Warrior, Rogue, Noble, Worker, Beast) and a quality percent. `bloodTag` words it as "Noble blood, rich (72%)" and shows on a targeted NPC's plaque (`bloodHoverLine`) and on the Blood Sight card. Resonance tiers start at 25, 50, 75 and 95 percent and fade 10 a day.

Feeding in Steal mode offers the Kiss, Drink and Drain. Pages for a new vampire live in the `vampire` group of `tutorialCatalogue.js` and pop through `noteFirstUse` (`vampire-bitten`, `-awakened`, `-blood`, `-gift`, `-feeding`, `-thralls`).
