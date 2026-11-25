---
slug: shipyards-port-town-siting
title: "Port Town Qualification and Port Site Placement"
domain: world
kind: subcard
parent: shipyards-crew-halls-and-lighthouses-overview
files:
  - src/travel/portPlaces.js
  - src/travel/travelPorts.js
  - src/world/portSites.js
  - src/net/fortLaw.js
  - src/world/merchantYards/merchantYardSites.js
  - src/world/townPlacesWorld.js
  - src/ui/overworldModel.js
routes: []
tables: []
replacesBible:
  - "03-World/Shipyards.md"
related:
  - shipyards-crew-halls-and-lighthouses-overview
  - harbor-quays-docking-and-gangways
  - harbour-board-ports-exchange-and-charts
  - horse-care-keep-stables-and-yards
invariants:
  - "isPortTown requires a PORT_TOWN_TYPES location (TownCity, TownHamlet, TownVillage) and a port verdict from portTownOnSea."
  - "portTownByData is true for hasPort(mapId) (src/travel/travelPorts.js) or a non-zero PortTownAndUnknown byte; data alone is not a coast."
  - "portTownOnSea also requires open sea within SEA_RING (2, src/net/fortLaw.js); openSeaOf floods water eight-way from the map border so inland lakes never count."
  - "townSeaOf needs a water body of at least SEA_CELLS_MIN (48) cells reaching the block-grid edge; seaField measures distance from it."
  - "With no sea cells in the blocks, seaBearing scores from map pixels; off-middle distance costs LATERAL_K (0.25) per cell."
  - "PORT_FOOT half extents: shipyard { hx 11, hz 8 }, lighthouse { hx 6.5, hz 6.5 }."
  - "Placement penalties: FACE_K (2) per cell a front falls short of backing onto the sea; NO_ROAD_COST (12) for a front onto no street."
  - "Lighthouse pays LIGHT_APART_K (0.5) of a cell per cell from the shipyard, up to LIGHT_APART_CAP (40)."
traps:
  - "Region capitals carry 0x10 in the PortTownAndUnknown byte; trusting the byte alone puts ports on inland capitals."
  - "Sites are carved from leftover ground after buildings (BUILDING_CLEAR_M 6), Stable and Wagon Yard (YARD_GAP_M 3), padded by YARD_PAD_M (NAV_CELL); the shipyard is placed first, and a town short of room logs `[port] <town>: no room for its ...` from src/world/townPlacesWorld.js."
dfu: []
tags:
  - ports
  - siting
  - sea
  - placement
---

# Port Town Qualification and Port Site Placement

Port qualification and site carving combine overworld open-sea flood checks with block-grid ground scoring (`src/travel/portPlaces.js`, `src/world/portSites.js`, and `src/world/townPlacesWorld.js`).

- **Coastal qualification:** `isPortTown` requires a `PORT_TOWN_TYPES` settlement (`TownCity`, `TownHamlet`, or `TownVillage`) and a positive `portTownOnSea` check. `portTownByData` matches `hasPort(mapId)` (`src/travel/travelPorts.js`) or a non-zero `PortTownAndUnknown` byte, which also marks inland region capitals with `0x10`. To exclude inland capitals and lakes, `portTownOnSea` requires open sea within `SEA_RING` (`2`, `src/net/fortLaw.js`), where `openSeaOf` floods `isWaterPixel` (`src/ui/overworldModel.js`) eight-way from the map border (yielding the 106-of-155 data-run port count).
- **Ground carving and placement:** The pipeline runs `townGroundOf`, `yardSitesOn` and `carveYards` (`src/world/merchantYards/merchantYardSites.js`, clearing buildings by `BUILDING_CLEAR_M = 6`, Stable and Wagon Yard by `YARD_GAP_M = 3`, padded by `YARD_PAD_M = NAV_CELL`), `townSeaOf` or `seaBearing`, `seaField`, and `portSite`. `townSeaOf` requires a water body of at least `SEA_CELLS_MIN` (`48`) cells reaching the block-grid edge; with no sea cells in the blocks, `seaBearing` scores from map pixels and charges `LATERAL_K` (`0.25`) per cell off-middle. `PORT_FOOT` half-extents are `shipyard { hx: 11, hz: 8 }` and `lighthouse { hx: 6.5, hz: 6.5 }`. Scoring adds `FACE_K` (`2`) per cell short of backing onto the sea and `NO_ROAD_COST` (`12`) without street frontage. The shipyard places first, the lighthouse pays `LIGHT_APART_K` (`0.5`) per cell from the shipyard up to `LIGHT_APART_CAP` (`40`), and missing room logs `[port] <town>: no room for its ...` in `src/world/townPlacesWorld.js`.
