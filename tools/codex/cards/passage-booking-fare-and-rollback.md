---
slug: passage-booking-fare-and-rollback
title: "Passage Booking: Destinations, Fare, and All-or-None Rollback"
domain: world
kind: subcard
parent: passage-booked-voyages-overview
files:
  - src/systems/naval/passage.js
  - src/systems/naval/passageHost.js
  - src/systems/naval/passageBerths.js
  - src/systems/naval/passageCastOff.js
  - src/travel/travel.js
  - src/travel/travelRoute.js
  - src/travel/travelViewWorld.js
  - src/justice/court.js
routes: []
tables: []
replacesBible:
  - "03-World/Passage.md"
related:
  - passage-booked-voyages-overview
  - passage-master-helm-resume-and-step-off
  - travel-view-routing-and-load-governor
  - economy-ledger-and-item-judge
invariants:
  - "passageDestinations lists only known ports (deps.place returns a summary). It skips the current port (hereKey) and any port within VOYAGE_LANDFALL_PX = 3 map pixels, and sorts nearest first, then by name."
  - "passageFare = calculateTripCost(0, max(1, pixels), { travelShip: true }).totalCost. That is 25 * (trunc(px/24) + 1), with every pixel counted as sea. There is no inn fee, and hasShip is never passed, so owning a ship gives no discount."
  - "book() is all-or-none: purse check, canGo (travelViewCanGo), charter(), castOff.begin, StartSailing, then route(). If refused, it stops sailing, forgets the cast-off, respawns the player at `stood`, remounts their prior transportMode, and lays the boat up."
  - "Gold is deducted (deductGold: coins, then letters of credit) only after charterSailed succeeds."
traps:
  - "Route planning with sea.voyage skips landfall nodes farther than VOYAGE_LANDFALL_PX from the goal (travelRoute.js). voyageSails accepts a plan only if it contains a 'sea' kind or the ship is already within 3 px."
  - "Pixels use the longest axis (passagePixels), not Euclidean distance."
dfu:
  - "Assets/Scripts/Game/Utility/TravelTimeCalculator.cs"
tags:
  - passage
  - fare
  - booking
  - rollback
  - gold
---

# Passage Booking: Destinations, Fare, and All-or-None Rollback

Booking a passage filters eligible destination ports, prices the crossing along the longest map-pixel axis, and executes an all-or-none launch transaction before deducting gold.

- **Destination Filtering and Picker Flow (`src/systems/naval/passage.js`, `src/systems/naval/passageHost.js`, `src/travel/travelRoute.js`):** `passageDestinations` collects known ports where `deps.place` returns a summary, excludes the current port (`hereKey`) and any port within `VOYAGE_LANDFALL_PX = 3` map pixels, and sorts results nearest first and then alphabetically by name. `offer()` presents a `ListPickerWindow` of destinations followed by a `YesNoBoxWindow` displaying the fare and player purse.
- **Longest-Axis Fare Calculation (`src/systems/naval/passage.js`, `src/travel/travel.js`, `src/justice/court.js`):** `passagePixels` measures distance along the longest map-pixel axis rather than Euclidean distance. `passageFare` evaluates `calculateTripCost(0, max(1, pixels), { travelShip: true }).totalCost`, yielding `25 * (trunc(px / 24) + 1)` gold with every pixel counted as sea, no inn fee, and no `hasShip` discount. `deductGold` (coins first, then letters of credit) runs only after `charterSailed` succeeds.
- **All-or-None Launch, Cast-Off, and Rollback (`src/systems/naval/passageHost.js`, `src/systems/naval/passageBerths.js`, `src/systems/naval/passageCastOff.js`, `src/travel/travelViewWorld.js`):** `book()` verifies the purse and `canGo` (`travelViewCanGo`), calls `charter()`, starts `castOff.begin` (which tows the vessel off the berth to the approach at `TOW_WAY`/`TOW_SLOW` and swings her toward the berth normal), invokes `StartSailing`, and calls `route()`. In `src/travel/travelRoute.js`, `sea.voyage` skips landfall nodes farther than `VOYAGE_LANDFALL_PX` from the goal, and `voyageSails` accepts a plan only if it includes a `'sea'` leg or starts within `3` px. If routing refuses, `book()` stops sailing, clears cast-off, respawns the player at `stood`, restores `transportMode`, and lays the boat up.
