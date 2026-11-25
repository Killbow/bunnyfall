---
slug: wild-zone-travel-strangers-and-zone-limits
title: "Wild Zone Travel Caps, Strangers, Unstuck, Truce, and Town Limits"
domain: multiplayer
kind: subcard
parent: wild-zone-overview
files:
  - src/world/wildZone.js
  - src/travel/travelPace.js
  - src/scenes/world.js
  - src/net/wildRef.js
  - src/net/online.js
  - src/worldEvents/gateSite.js
  - src/worldEvents/raidingParties.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Wild-Zone.md"
related:
  - wild-zone-overview
  - travel-view-overworld-overview
  - travel-view-traveller-marks-and-hud
  - eltheric-ocean-open-pvp-zone-and-crossing
invariants:
  - "`setPaceZoneCap(WILD_PACE_CAP)` in `src/travel/travelPace.js` caps travel speed to `{ road: 40, open: 20 }` inside the mountain zone, never on the ocean."
  - "Carriage travel into the zone charges `WILD_TRAVEL_FEES` (`[2500, 5000, 10000, 15000]`) by destination ring with a `WILD_TRAVEL_COOLDOWN_MS` (`10` min) cooldown."
  - "In an active PvP zone, strangers appear on the map at `WILD_STRANGER_SEE_M` (`1500` m), trigger a warning at `WILD_STRANGER_M` (`600` m), slow travel like an enemy within `WILD_STRANGER_SLOW_M` (`200` m), and force travel view down to 3D within `100` m."
  - "`createPartyTruce` grants a `WILD_PARTY_TRUCE_MS` (`10` min) truce after leaving a party, while `wildKin` treats party members, duel partners, and guildmates as friendly kin."
  - "Region `16` is excluded from Oblivion Gate spawns (`gateRegions` in `src/worldEvents/gateSite.js`) and overland raiding parties (`isWildRegion` in `src/worldEvents/raidingParties.js`)."
traps:
  - "Stranger detection applies only when `cromwarkPeace` is false; inside the Cromwark mountain reach, `wildIsStranger` always returns false."
  - "In a PvP zone, `/unstuck` is refused outdoors (`unstuckOut`) or with a stranger within `UNSTUCK_ENEMY_M` (`600` m), and indoors it waits `UNSTUCK_WAIT_MS` (`5` min) with an `UNSTUCK_COOLDOWN_ZONE_MS` (`60` min) cooldown; the Cromwark reach allows outdoor `/unstuck` after `CROMWARK_UNSTUCK_WAIT_MS` (`30` s) with a `CROMWARK_UNSTUCK_COOLDOWN_MS` (`5` min) cooldown."
dfu: []
tags:
  - wild-zone
  - travel
  - strangers
  - unstuck
  - truce
---

Movement caps, carriage fees, stranger detection, truce windows, `/unstuck` timers, and regional exclusions live in `src/world/wildZone.js`, `src/travel/travelPace.js`, `src/scenes/world.js`, `src/net/wildRef.js`, and `src/net/online.js`.

## Pace Caps, Carriage Fees, and Regional Limits

In the Wrothgarian Mountains, `setPaceZoneCap(WILD_PACE_CAP)` limits overland pace to `{ road: 40, open: 20 }` (never applied at sea), and ring banners hold for `WILD_LINE_HOLD_S` (`7` seconds). Carriages charge `WILD_TRAVEL_FEES` (`[2500, 5000, 10000, 15000]`) by ring with a `WILD_TRAVEL_COOLDOWN_MS` (`10`-minute) cooldown. Anywhere `wildHere()` holds, `wildNoBank` blocks banking and `guardScale` multiplies town guards by `ZONE_WATCH_SCALE` (`10`). Region `16` also suppresses Oblivion Gates (`gateRegions` in `src/worldEvents/gateSite.js`) and raiding parties (`isWildRegion` in `src/worldEvents/raidingParties.js`).

## Strangers, Kin Truces, and Unstuck Rules

Where `cromwarkPeace` is false, `wildKin` (`src/net/wildRef.js`) treats party members, duelists, and guildmates as kin, and `createPartyTruce` holds a `WILD_PARTY_TRUCE_MS` (`10`-minute) truce after a party split. The relay retains a client's zone flag for `WILD_ZONE_KEEP_MS` (`15_000` ms). Non-kin strangers show a red mark at `WILD_STRANGER_SEE_M` (`1500` meters), warn at `WILD_STRANGER_M` (`600` meters), slow travel within `WILD_STRANGER_SLOW_M` (`200` meters), and drop travel view to 3D within `100` meters.

In a PvP zone, `/unstuck` (`src/net/online.js`) is refused outdoors (`unstuckOut`) or with a stranger within `UNSTUCK_ENEMY_M` (`600` meters), and indoors it waits `UNSTUCK_WAIT_MS` (`5` minutes) with an `UNSTUCK_COOLDOWN_ZONE_MS` (`60`-minute) cooldown (`UNSTUCK_COOLDOWN_MS` = `30` minutes outside wild zones). The Cromwark reach permits outdoor `/unstuck` after `CROMWARK_UNSTUCK_WAIT_MS` (`30` seconds) with a `CROMWARK_UNSTUCK_COOLDOWN_MS` (`5`-minute) cooldown.
