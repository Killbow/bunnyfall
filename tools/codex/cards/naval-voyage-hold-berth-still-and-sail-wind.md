---
slug: naval-voyage-hold-berth-still-and-sail-wind
title: "Voyage Hold: Still Berths, Kept Departures, and Outdoors Load Wind"
domain: naval
kind: subcard
parent: belt-waist-lanterns-and-festival-cake-cap-overview
files:
  - src/systems/naval/csaLoadWind.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/helmWay.js
  - src/systems/naval/navalBerth.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/harbourOffice.js
  - src/systems/naval/captainLedger.js
  - src/systems/naval/seasWorld.js
  - src/world/portSites.js
  - src/net/fortLaw.js
  - src/world/ethericSea.js
  - src/world/worldSaveLoad.js
  - src/systems/questlines/quests/QLIS01.txt
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-21b.md"
related:
  - belt-waist-lanterns-and-festival-cake-cap-overview
  - naval-and-come-sail-away
  - harbour-board-ports-exchange-and-charts
  - harbor-quays-docking-and-gangways
invariants:
  - "SAIL-WIND: `seaWind(windLen)` = `windLen > 0 ? WIND_RATED * windShare(windLen) : 0` (`WIND_RATED` = 1.5, helmWay.js), so a zero wind gives no way under sail. Oars do not read the wind."
  - "`OnLoad` (comeSailAway.js:2831-2834) calls `UpdateWind(deps.weatherType?.() ?? WEATHER_TYPE.Sunny)` when `windStaleOutdoors(deps.isPlayerInside(), state.windVectorCurrent)` is true: the player is outside and the wind is three zero components."
  - "VOYAGE-HOLD: `createBerthWatch` (navalBerth.js) sends `{ type: 'berth', port, boat, still }` with `still = ownWay(boat) <= BERTH_STILL` (0.5 m/s). Letting go of the helm in a port's waters with no hostile near sends `still: true`."
  - "`berthed` (`harbourOffice.js`) notes 'port-reached' when a berth is at a different port and at least `PORT_VOYAGE_M` (`LEAGUE_M / 4`, 1207 m) has been sailed. Otherwise it moves `log.departed` only on the first berth or when `still` is not false."
  - "`newLog().departed` is null, and `restoreDeparted` re-reads it on load (captainLedger.js:159, 460), so a reload keeps a voyage in progress."
traps:
  - "A beached boat counts as still: `boatPose` and `ownWay` zero the velocity when `IsBeached`, so a boat aground logs no leagues (navalHost.js:761-763, 2729)."
  - "`boardPortAt` (`portSites.js`) picks the nearest port within `SEA_RING` (2) by squared distance, with the first listed port winning ties so Pencart and Longham keep distinct waters."
  - "`YARD_SPEED` (2.5 m/s, navalHost.js:453) is the berth gate. A Rowboat (2 m/s) is always under it, which is why departure used to follow her out to the edge of the port's waters."
dfu: []
tags:
  - naval
  - come-sail-away
  - berth
  - voyage
  - wind
  - questlines
---

# Voyage Hold: Still Berths, Kept Departures, and Outdoors Load Wind

Sail wind initialization on save load, still-boat berth detection, and persisted voyage departure records are implemented across `src/systems/naval/csaLoadWind.js`, `src/systems/naval/comeSailAway.js`, `src/systems/naval/helmWay.js`, `src/systems/naval/navalBerth.js`, `src/systems/naval/harbourOffice.js`, and `src/systems/naval/captainLedger.js`.

## Outdoors Load Wind and Sail Way

In `src/systems/naval/helmWay.js`, `seaWind(windLen)` evaluates to `windLen > 0 ? WIND_RATED * windShare(windLen) : 0` (`WIND_RATED = 1.5`), giving zero sail headway at zero wind while oars ignore wind. Because indoor saves (waking outdoors online per `src/world/worldSaveLoad.js`) store zero wind, `OnLoad` (`src/systems/naval/comeSailAway.js`) calls `UpdateWind(deps.weatherType?.() ?? WEATHER_TYPE.Sunny)` whenever `windStaleOutdoors(deps.isPlayerInside(), state.windVectorCurrent)` (`src/systems/naval/csaLoadWind.js`) detects an outside player with a zero wind vector.

## Still Berths and Voyage Departures

`createBerthWatch` (`src/systems/naval/navalBerth.js`) emits `{ type: 'berth', port, boat, still }` where `still` is `ownWay(boat) <= BERTH_STILL` (`0.5` m/s, below the `YARD_SPEED = 2.5` m/s gate in `src/systems/naval/navalHost.js`, or true on helm release without hostiles; beached boats also zero velocity). `berthed` (`src/systems/naval/harbourOffice.js`) records `'port-reached'` for a different port (resolved by `boardPortAt` in `src/world/portSites.js`) after sailing `PORT_VOYAGE_M` (`1207` m for `QLIS01.txt`), and updates `log.departed` (persisted by `restoreDeparted` in `src/systems/naval/captainLedger.js`) only on first berth or when `still` is not false.
