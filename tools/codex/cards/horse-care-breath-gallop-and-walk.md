---
slug: horse-care-breath-gallop-and-walk
title: "Horse Breath, the Gallop Gate, and the Walk Gait"
domain: world
kind: subcard
parent: horse-care-tiers-overview
files:
  - src/travel/steedCare.js
  - src/travel/transport.js
  - src/player/motor.js
  - src/systems/upkeep/upkeepRuntime.js
  - src/travel/travelAidsWorld.js
  - src/travel/riding.js
  - src/mods/modSettings.js
  - src/mods/rrRidingHost.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Care.md"
related:
  - horse-care-tiers-overview
  - travel-view-overworld-overview
invariants:
  - "A caring tier walks by default (DF_WALK_BASE 150) and gallops only with Run held through transport.js canRunUnlessRiding -> gallopGate (not winded, not starving, after the mod decision)."
  - "A refused gallop walks only where refusedRunWalks is set (Hard). Boons rides it at DFU DF_RIDE_BASE 375 pace, so holding Run is never slower than DFU horse."
  - "world.js wraps setRideWalk with `rideOnTheRoad()` is false, so the travel view and autopilot journeys keep DFU ride pace."
traps:
  - "When horse care pays the gallop in breath, riderPaysGallop is false, and the rider takes no running fatigue."
  - "TOWN-GALLOP: the port ships EnhancedRiding.GallopingInTowns ON (the mod default is OFF). TrampleCivilians, default true, rides with it and charges a crime."
dfu:
  - Assets/Scripts/Game/Player/PlayerSpeedChanger.cs
  - Assets/Scripts/Game/PlayerMotor.cs
tags:
  - horse
  - gallop
  - breath
  - gait
  - dfu-parity
---

# Horse Breath, the Gallop Gate, and the Walk Gait

Under an active care tier, mounted movement separates into a default walk gait (`DF_WALK_BASE` `150` in `src/player/motor.js`), classic ride pace (`DF_RIDE_BASE` `375` in `src/travel/transport.js`), and a breath-driven gallop gated by `canRunUnlessRiding` and `gallopGate`.

- **Gaits and refused gallops (`src/travel/transport.js`, `src/travel/riding.js`):** A cared-for horse walks unless the player holds Run and passes `gallopGate` (neither winded nor starving after the mod check). Walking overlay frames advance at `WALK_FRAME_TIME = 2 * ANIM_FRAME_TIME`. If a gallop is refused, Hard drops to a walk (`refusedRunWalks: true`), whereas Boons rides at `DF_RIDE_BASE` (`375`) so holding Run is never slower than classic riding. `src/scenes/world.js` disables the walk override while `rideOnTheRoad()` is active (`src/travel/travelAidsWorld.js`), keeping travel view and autopilot journeys at ride pace.
- **Breath pool and speed scaling (`src/travel/steedCare.js`, `src/systems/upkeep/upkeepRuntime.js`):** Maximum breath is `breathMax = STAMINA_BASE + 1.2 * Stamina` (`STAMINA_BASE` `40`). Galloping spends `GALLOP_SPEND * (1.25 - Endurance / 200)` (`GALLOP_SPEND` `3.3`) per second, and `riderPaysGallop` stays `false` so the rider incurs no running fatigue. Breath recovers at `BREATH_BACK * (0.75 + Endurance / 200)` (`BREATH_BACK` `2.2`) per second, multiplied by `RIDDEN_BACK` (`0.5`) while mounted and by the hunger breath factor when `hungerCosts` is true. Reaching `0` breath leaves the mount winded until `WINDED_UNTIL` (`0.3`) of the meter refills. `steedSpeedScale` scales pace by `clamp(0.85 + 0.003 * speed, 0.85, 1.15)` and floors at `1` on Boons.
- **Town galloping (`src/mods/modSettings.js`, `src/mods/rrRidingHost.js`):** `EnhancedRiding.GallopingInTowns` defaults to on alongside `TrampleCivilians` (`true`), which charges a crime when trampling townsfolk.
