---
slug: harbor-quays-docking-and-gangways
title: "Harbor Quays, Pier Dress, Docking Warp, and Gangways"
domain: world
kind: subcard
parent: holdings-tab-overview
files:
  - src/systems/naval/quays.js
  - src/systems/naval/quayPool.js
  - src/world/quayModel.js
  - src/systems/naval/harbourBook.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/passageQuay.js
  - src/world/portSites.js
  - src/net/fortLaw.js
  - src/world/deepWaterFloor.js
routes: []
tables: []
replacesBible:
  - "03-World/Holdings.md"
related:
  - holdings-fleet-ledger-titles-and-refits
  - naval-and-come-sail-away
  - harbour-board-ports-exchange-and-charts
invariants:
  - "Berths are sounded for the Carrack (`BERTH_HULL`); the quay face sits `QUAY_GAP` (`0.8` meters) off its widest beam, `QUAY_WIDTH` (`4.5` meters) deep, with its deck `QUAY_DECK_UP` (`1.6` meters) above sea level."
  - "`DOCK_REFUSED` is `[3]`: a Large Galley never docks at a quay (`dockFor` returns `null`), so summoning places it in open water."
  - "A ship warps into a berth only when sails are struck (with no oars active), speed is below `DOCK_WAY` (`2` m/s), distance is within `DOCK_REACH_M` (`25` meters), and heading is within `DOCK_ANGLE` (`40` degrees) with no hostile ship nearby; it is made fast within `FAST_M` (`1.5` meters) and `FAST_DEG` (`6` degrees)."
  - "Gangways connect only to player-owned ships that are made fast, allowing boarding within `GANGWAY_REACH` (`3` meters) and stepping ashore within `GANGWAY_ASHORE` (`1.5` meters) while facing the destination."
  - "`boatAtBerth` keeps a berth reserved for any vessel occupying it, even when that vessel is culled by distance."
traps:
  - "Unbuilt terrain chunks read as dry land; `createHarbourBook` (`src/systems/naval/harbourBook.js`) retries every `HARBOUR_RETRY_S` (`10` seconds) and never caches a missing-harbor result before the terrain is built."
dfu: []
tags:
  - quays
  - harbor
  - docking
  - gangway
  - piers
  - deep-waters
---

# Harbor Quays, Pier Dress, Docking Warp, and Gangways

Coastal harbor towns sound the water within `SEA_RING` (`2` map pixels, including diagonal ring corners such as Aldbrugh) to place procedural timber piers, docking berths, and boarding gangways (`src/systems/naval/quays.js`, `src/systems/naval/quayPool.js`, and `src/world/quayModel.js`).

## Berth Sounding, Jetties, and Pier Dress

Berths are sized for the Carrack (`BERTH_HULL`), placing a `QUAY_WIDTH` (`4.5` meters) deck `QUAY_DECK_UP` (`1.6` meters) above sea level and `QUAY_GAP` (`0.8` meters) outside its widest beam. `planQuay` drives piles every `PILE_STEP` (`4` meters) to at most `PILE_DEPTH` (`6` meters), then walks shoreward in `JETTY_STEP` (`1` meter) steps for a `JETTY_WIDTH` (`3` meters) jetty up to `JETTY_MAX` (`SHORE_TERRAIN_FIT_METERS = 180` plus `JETTY_BEACH = 20`).

`pierDress` adds cranes, lanterns, bollards, fenders, ladders, and cargo props rendered by `src/world/quayModel.js`. Because unbuilt terrain reads as land, `createHarbourBook` (`src/systems/naval/harbourBook.js`) retries every `HARBOUR_RETRY_S` (`10` seconds) before recording a missing harbor.

## Docking Warp and Gangways

`DOCK_REFUSED` (`[3]`) excludes the Large Galley (`dockFor` returns `null`), placing summoned galleys in open water. Eligible ships warp into a free berth (`boatAtBerth` keeps berths reserved across distance culling) when sails are struck without oars, speed is under `DOCK_WAY` (`2` m/s), range is within `DOCK_REACH_M` (`25` meters) and `DOCK_ANGLE` (`40` degrees), and no hostile ship is near. The ship is made fast within `FAST_M` (`1.5` meters) and `FAST_DEG` (`6` degrees). Gangways run only to player-owned ships that are made fast, boarding within `GANGWAY_REACH` (`3` meters) and leaving ashore within `GANGWAY_ASHORE` (`1.5` meters).
