---
slug: wagon-upkeep-wear-and-condition
title: "Wagon Condition States, Wear Sources, and Pace"
domain: world
kind: subcard
parent: wagon-upkeep-tiers-overview
files:
  - src/travel/wagonUpkeep.js
  - src/systems/upkeep/upkeepRuntime.js
  - src/items/itemTemplates.js
  - src/travel/wagonKinds.js
  - src/travel/horseCart.js
  - src/travel/wagon/wagonWardenHost.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/player/motor.js
  - src/travel/steedCare.js
  - src/ui/holdingsPages.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagon-Upkeep.md"
related:
  - wagon-upkeep-tiers-overview
  - wagon-upkeep-mending-and-repair-refusal
  - horse-care-breath-gallop-and-walk
  - holdings-stable-and-transport-stabling
invariants:
  - "Every wagon is template 93 (TRANSPORT_SMALL_CART), 1400 condition max; a wagon with no `currentCondition` reads as whole (mintCondition)."
  - "WAGON_STATES by share of whole: Sound >= 0.6 (pace 1), Worn >= 0.3 (1), Rickety >= 0.1 (0.85), Failing >= 0 (0.7); Failing is the floor."
  - "WEAR_FLOOR = 1: wearWagon never takes condition below 1 point; legacy saves at 0 read as Failing. The old Broken state is retired (WAGON-MEND)."
  - "rollWear = km * WEAR_A_KM (0.01) * OFFROAD (2.5 off road) * (1 + LOAD_WEAR 0.75 * load) * KIND_WEAR { cart: 1, openWagon: 0.85, caravan: 0.7 }."
  - "journeyWear = min(JOURNEY_WEAR_MAX 0.2, days * JOURNEY_WEAR_A_DAY 0.01), applied only when `wagonGoesOnJourney()` (a stabled or parked wagon stays and does not wear)."
  - "The watch's throw (`throwMine` -> `thrown()`) wears THROWN_WEAR 0.1."
  - "`wagonPace` = (wearSlows ? state pace : 1) * (Sound ? soundPace : 1); `rideScale('Cart')` multiplies in `teamDraftScale` from horse care."
traps:
  - "Road wear accrues via `createWearAccount` fractional points; tick ignores frames with meters >= 1000 and only counts when `wagonGoes`."
  - "Odometer placements are skipped by the motor, so teleports never wear a wagon."
  - "On Boons a Failing meter shows the plain tone, never 'blood' (`wagonMeterTone`)."
dfu: []
tags:
  - wagon
  - wear
  - condition
  - pace
  - odometer
---

# Wagon Condition States, Wear Sources, and Pace

Every wagon uses item template `93` (`TRANSPORT_SMALL_CART`) with `1400` maximum condition (`mintCondition`, assumed when `currentCondition` is unset). `wearWagon` clamps condition at `WEAR_FLOOR = 1`, and legacy saves at `0` read as Failing because the Broken state is retired (`WAGON-MEND`).

- **Condition thresholds and UI tones (`src/travel/wagonUpkeep.js`, `src/ui/holdingsPages.js`):** `WAGON_STATES` maps condition share to `Sound` (`>= 0.6`, pace `1`), `Worn` (`>= 0.3`, pace `1`), `Rickety` (`>= 0.1`, pace `0.85`), and `Failing` (`>= 0`, pace `0.7`). Stepping down triggers one `sayWorn` notice (omitting slowness wording under Boons). `WAGON_METER_TONE` styles Holdings meters `'verdigris'` for Sound or Worn, `''` for Rickety, and `'blood'` for Failing, while `wagonMeterTone` uses `''` for Failing on Boons.
- **Wear accumulation (`src/travel/wagonUpkeep.js`, `src/systems/upkeep/upkeepRuntime.js`, `src/player/motor.js`, `src/travel/wagon/wagonWardenHost.js`):** Overworld driving (~7 meters per point) accrues fractional points in `createWearAccount` via `rollWear = km * WEAR_A_KM (0.01) * OFFROAD (2.5 off road) * (1 + LOAD_WEAR 0.75 * load) * KIND_WEAR` (`cart: 1`, `openWagon: 0.85`, `caravan: 0.7`). Runtime ticks ignore `meters >= 1000` or motor placement teleports and count only while `wagonGoes`. Fast travel applies `journeyWear = min(0.2, days * 0.01)` (`JOURNEY_WEAR_MAX`, `JOURNEY_WEAR_A_DAY`) when `wagonGoesOnJourney()` is true (stabled or parked wagons stay behind). A watch throw (`throwMine` to `thrown()`) adds `THROWN_WEAR = 0.1`.
- **Pace coupling (`src/travel/wagonUpkeep.js`, `src/travel/steedCare.js`):** `wagonPace` multiplies `(wearSlows ? state.pace : 1)` by `(Sound ? soundPace : 1)`, and `rideScale('Cart')` folds in `teamDraftScale`.
