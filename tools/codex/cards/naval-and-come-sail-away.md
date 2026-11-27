---
slug: naval-and-come-sail-away
title: Naval Systems, Ports, and Come Sail Away
domain: world
kind: overview
files:
  - src/systems/naval/ship.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/quays.js
  - src/systems/naval/etherCrossing.js
  - src/systems/naval/fishingBoats.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/comeSailAwayHulls.js
  - src/systems/naval/comeSailAwayActions.js
  - src/systems/naval/navalDirector.js
  - src/travel/travel.js
  - src/travel/travelPorts.js
  - src/travel/portHost.js
dfu:
  - Assets/Scripts/Game/TransportManager.cs
related:
  - world-modes-and-transitions
  - pixel-streaming-and-origin-shift
invariants:
  - Whenever `isOnShip` is true, `playerTravelPosition` resolves travel time, fares, and port eligibility from `boardShipPosition.mapPixel` rather than the open-ocean ship pixel.
  - Veil crossings (`etherCrossing.js`) require helms at least `CROSS_LAND_PX` from land with no nearby enemies or non-party passengers, taking `CROSS_DAYS` (`3`) days.
traps:
  - Leaving `boardShipPosition` out of travel origin calculations strands shipboard travel pricing at ocean pixels `(2, 2)` or `(5, 5)`.
  - Naval combat (`createNavalHost` in `src/systems/naval/navalHost.js`) belongs only to the exterior world host; interiors and dungeons have no broadsides.
  - "`comeSailAwayHulls.js` and `comeSailAwayActions.js` are leaf modules: the account server loads the hull table through `itemLaw.js` and `comeSailAwayItems.js`, and the HUD helm panel (`enhancedHelm.js`) reads `HULL_NAMES` and `BOAT_ACTIONS`, so neither file may import `comeSailAwayBoat.js` (the boat renderer) or `comeSailAway.js`."
tags:
  - naval
  - ships
  - ports
  - come-sail-away
  - veil
---

# Naval Systems, Ports, and Come Sail Away

Maritime travel combines classic Daggerfall ship teleports, procedural harbor infrastructure, real-time Come Sail Away sailing, and open-sea combat across `src/systems/naval/`, `src/systems/comeSailAway/`, `src/systems/travel/`, and `src/scenes/`.

- **Owned ships and boarded-port rule:** Classic ship transport (`src/systems/naval/ship.js`) teleports to ocean pixels `(2, 2)` or `(5, 5)` and stores compensation-free `boardShipPosition` (`shipMemory`). Because the live ship pixel sits in open ocean, `playerTravelPosition` (`src/travel/travel.js`) resolves travel time, fares, and port eligibility (`src/travel/travelPorts.js`) from `boardShipPosition.mapPixel` whenever `isOnShip` is true.
- **Harbors, quays, and fishing fleets:** Harbor towns place shipyards and lighthouses (`src/travel/portHost.js`), terrain-fitted piers with docking warps and gangways (`src/systems/naval/quays.js`), and deterministic daily skiff and smack fleets (`src/systems/naval/fishingBoats.js`).
- **Come Sail Away and sea battles:** `src/systems/naval/comeSailAway.js`, `src/systems/naval/navalHost.js`, and `src/systems/naval/navalDirector.js` drive helm sailing, solid peer boat colliders, sea traffic spawns, broadsides, and boarding, drawn by `src/render/comeSailAwayRender.js` and `src/render/navalRender.js`.
- **Veil crossings (`src/systems/naval/etherCrossing.js`):** Helms far from land (`CROSS_LAND_PX`) with no enemies or non-party passengers offer 3-day (`CROSS_DAYS`) crossings between the Abecean and Veilhaven (`crossingTarget`).
