---
slug: holdings-fleet-ledger-titles-and-refits
title: "Fleet Page: Ship Ledger, Title Book, Remote Repair, Refits, and Crew Posts"
domain: world
kind: subcard
parent: holdings-tab-overview
files:
  - src/systems/naval/fleet.js
  - src/systems/naval/fleetHost.js
  - src/ui/fleetPage.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/comeSailAwayWire.js
  - src/systems/naval/shipCrew.js
  - src/systems/naval/crewLife.js
routes: []
tables: []
replacesBible:
  - "03-World/Holdings.md"
related:
  - holdings-tab-overview
  - harbor-quays-docking-and-gangways
  - captain-tree-and-ore-refits
  - ship-livery-flags-and-plaques
  - crew-veterancy-posts-and-headcount-exchange
invariants:
  - "The fleet ledger stores at most `FLEET_MAX` (`256`) ship records keyed by ship UID, clamping restored ship value to `[0, SHIP_VALUE_MAX]` (`10,000,000`)."
  - "Ship deeds (Come Sail Away item `1321`) register into the title book (`fleetBook`, `titleDeedsIn`) rather than staying in the backpack, except a deed held by an in-progress water placement is skipped."
  - "New ship purchases no longer stamp a `credit` bank claim, while `loanOwed(rec, accounts)` and `settleCredit` still block refits on legacy ship saves carrying `credit` until the regional bank debt reaches zero."
  - "A refit never heals a ship; existing hull and sail damage carry over as the same percentage of its refitted maximums."
  - "A crew holds at most one `'First Mate'`; assigning a new First Mate demotes the previous holder to `'Deckhand'` (`src/systems/naval/shipCrew.js`)."
  - "`repairAway` requires a crewed hull with crew aboard and no active combat, capped by `FIELD_MEND_CAP` and available onboard repair stores."
traps:
  - "Do not stamp `credit` on new ship purchases; only legacy saves carry `credit` for `loanOwed` and `settleCredit` checks."
  - "`CREW_ROLES` (`src/systems/naval/shipCrew.js`, plus `'Bard'` in `src/systems/naval/fleetHost.js`) defines assignable roster roles persisted locally without peer wire sync, and is distinct from the 5-post `ROLE_POSTS` deck-station list in `src/systems/naval/crewLife.js`."
dfu: []
tags:
  - holdings
  - fleet
  - ships
  - refit
  - crew
  - deeds
---

# Fleet Page: Ship Ledger, Title Book, Remote Repair, Refits, and Crew Posts

The `fleet` section (`src/ui/fleetPage.js`, driven by `src/systems/naval/fleetHost.js` and `src/systems/naval/fleet.js`) manages player-owned ships, title deeds, remote repairs, refits, and crew assignments.

## Ship Ledger, Deeds, and Quay Verbs

`fleetSaveData` tracks up to `FLEET_MAX` (`256`) vessels by UID and clamps restored values to `[0, SHIP_VALUE_MAX]` (`10,000,000`). Ship deeds (item `1321`) enter the title book (`fleetBook`, `titleDeedsIn`), skipping any deed mid-placement. Fleet `summon` -> `freeBerth(hull)` then `SummonBoat` at a quay (or water placement), while send away runs `LayUpBoat`. Ship names (`SHIP_NAME_MAX = 24`) pass `shipNameVerdict` locally and on the peer wire (`comeSailAwayWire.js`).

## Refits, Legacy Credit, and Remote Repair

`UPGRADE_LINES` (`hold`, `rigging`, `hull`, and `guns`) spend timber, iron, and pitch across `BASE_TIERS` (`3`) plus `ORE_TIERS`, scaled by `HULL_UPGRADE_SCALE` (`[0.5, 0.75, 1, 1.75, 2.5]`). Refits never heal a ship; damage stays at the same fraction of its refitted maximums. New ship purchases no longer stamp a `credit` bank claim, while `loanOwed(rec, accounts)` and `settleCredit` still block refits on legacy ship saves carrying `credit`. `repairAway` mends a crewed, out-of-combat hull up to `FIELD_MEND_CAP` using ship stores.

## Local Crew Roles vs. Deck Posts

Crew role assignments persist locally in `shipCrew.js` without peer wire sync, keeping one `'First Mate'` (reassigning demotes the prior holder to `'Deckhand'`). `CREW_ROLES` (`shipCrew.js`, plus `'Bard'` in `fleetHost.js`) is distinct from the 5-post `ROLE_POSTS` list (`First Mate`, `Bosun`, `Carpenter`, `Cook`, and `Gunner`, with the Lookout at the bow) in `crewLife.js`.
