---
slug: travel-options-journey-overview
title: "Travel Options Journeys Overview"
domain: world
kind: overview
parent: null
files:
  - src/travel/travelOptions.js
  - src/travel/travelAutopilot.js
  - src/ui/travelPopUp.js
  - src/ui/travelControlUI.js
  - src/ui/enhancedTravelControl.js
  - src/world/timeScale.js
  - src/scenes/world.js
  - src/world/pixelBuild.js
  - src/world/worldSaveLoad.js
  - src/platform/onlineLane.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Travel-Options.md"
related:
  - travel-options-path-following-and-ring-walk
  - travel-options-steering-feelers-and-budgets
  - travel-options-pace-dials-and-rate-ceilings
  - travel-view-overworld-overview
  - held-map-travel-options-and-filter-key
  - roads-network-overview
invariants:
  - "`isPlayerControlledTravel(settings, { speedCautious, sleepModeInn, travelShip })` in `src/ui/travelPopUp.js` is (`cautiousTravel` or `speedCautious` false) and (`stopAtInnsTravel` or not `sleepModeInn`) while `travelShip` is false. A ship trip is never walked."
  - "`createTravelOptions().update` runs in this order: close the stopping window once it is on top; `H` shows help; town-key, sea-leg, and gates-shut checks; `TravelAutopilot.update` (returns early when `gamePaused`); HUD or other windows interrupt; the follow key; ring path crossing; cautious health then fatigue; `LOC_PAUSE_NEAR` location stop; ocean stop; enemies stop; new disease interrupts and shows health; steering stop; `applyRate`; idle follow key; junction map upkeep."
  - "`interruptTravel` calls `setTimeScale(1)`, restores mouse look and weather/sound, and keeps a named destination for resume. A spot route (no summary) is dropped."
  - "Save load calls `clearTravelDestination` (`src/world/worldSaveLoad.js`). No travel-options state goes into the save."
  - "Online, `ONLINE_ROOM_MOD_KEYS['travel-options']` (`src/platform/onlineLane.js`) forces `Enabled`, `CautiousTravel.PlayerControlledCautiousTravel`, `StopAtInnsTravel.PlayerControlledInnsTravel`, and `ShipTravel.OnlyFromPorts`. A land fast travel online says `ONLINE_LAND_TRAVEL_REFUSAL` instead of teleporting."
traps:
  - "Boot order (`BOOT-TDZ`/`BOOT-TDZ2`): `travelOptions`, `_travelRegionSeen`, `_travelWeatherOff`, and `_travelSoundsOff` are declared in `src/scenes/world.js` before the first pixel build, and `pixelBuild.js` checks `host.travelOptions && dfLocation` before calling `initLocationRects`. Moving them below the builder throws in the temporal dead zone."
  - "Fare haggling (`TO-FARE`) reads `skillValue(e, SKILLS.Mercantile)`, never a `'mercantile'` stat. Online, `scaleTripCost` also halves both fare halves via `essentialPrice` (`ESSENTIALS-HALF`)."
  - "The ship laws read `travelOriginMapId()`: on the player ship, the boarding port is the origin (`SHIP-PORT`)."
dfu: []
tags:
  - travel-options
  - journey
  - autopilot
  - online
  - fast-travel
---

Travel Options routes eligible overland journeys through real-time accelerated walking across the streamed exterior world rather than instant teleportation.

## Entry Gate, Boot Order, and Online Laws

When `isPlayerControlledTravel(settings, { speedCautious, sleepModeInn, travelShip })` in `src/ui/travelPopUp.js` holds (`travelShip` is false, `cautiousTravel` or not `speedCautious`, and `stopAtInnsTravel` or not `sleepModeInn`), `src/scenes/world.js` launches `beginAcceleratedTravel` instead of classic fast travel. To avoid temporal dead zone crashes (`BOOT-TDZ` and `BOOT-TDZ2`), `world.js` declares `travelOptions`, `_travelRegionSeen`, `_travelWeatherOff`, and `_travelSoundsOff` before initial terrain generation, and `src/world/pixelBuild.js` verifies `host.travelOptions && dfLocation` before calling `initLocationRects` or `setLocationRects`. Loading a save calls `clearTravelDestination` (`src/world/worldSaveLoad.js`); no journey state persists in saves.

Online (`src/platform/onlineLane.js`), `ONLINE_ROOM_MOD_KEYS['travel-options']` forces `Enabled`, `CautiousTravel.PlayerControlledCautiousTravel`, `StopAtInnsTravel.PlayerControlledInnsTravel`, and `ShipTravel.OnlyFromPorts`, refusing instant overland travel with `ONLINE_LAND_TRAVEL_REFUSAL`. Ship checks (`isNotAtPort`, `hasNoOceanTravel`) read `travelOriginMapId()` (using the boarding port on a player ship, `SHIP-PORT`), `shipTravelRefusal` returns `'noport' | 'nodestport' | 'nosailing' | null`, and `enforceShipRestriction` clears `opts.travelShip` on refusal.

## Frame Loop, Fares, and Encounters

`createTravelOptions().update` (`src/travel/travelOptions.js`, with `src/ui/travelControlUI.js` and `src/ui/enhancedTravelControl.js`) drives `TravelAutopilot` (`src/travel/travelAutopilot.js`, `ARRIVAL_BUFFER = 800`, `OVERSHOOT_YAW_DEGREES = 5`) and evaluates health, fatigue, location, ocean, enemy, disease, and steering stops before `applyRate` (`src/world/timeScale.js`). `interruptTravel` resets `setTimeScale(1)`, restores mouse look, weather, and audio, preserves named destinations, and drops spot routes.

Fare discounts read `skillValue(e, SKILLS.Mercantile)` (`TO-FARE`), while online `scaleTripCost` halves both fare components via `essentialPrice` (`ESSENTIALS-HALF`). Mages Guild teleports charge `teleportCost(rank) = (TELEPORT_RANK_FREE - rank) * TELEPORT_COST_PER_RANK` (`200` in `src/ui/travelMapOptions.js`). Encounter evasion rolls `avoidEncounterChance = min(luck + stealth - 50, maxAvoidChance)` for `IGNORE_ENCOUNTERS_SECONDS` (`15` s) of grace.
