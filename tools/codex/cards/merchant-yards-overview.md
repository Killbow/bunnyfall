---
slug: merchant-yards-overview
title: "Merchant Yards: Stables, Wagon Yards and the Joinery"
domain: world
kind: overview
parent: null
files:
  - src/world/merchantYards/merchantYards.js
  - src/world/merchantYards/merchantYardsHost.js
  - src/world/merchantYards/merchantYardModels.js
  - src/world/merchantYards/merchantYardArt.js
  - src/world/townPlacesWorld.js
  - src/scenes/world.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "03-World/Merchant-Yards.md"
related:
  - merchant-yards-placement-and-ground
  - merchant-yards-trade-keepers-and-discovery
  - horse-care-keep-stables-and-yards
  - shipyards-port-town-siting
  - shipyards-crew-halls-and-lighthouses-overview
  - yard-decor-culling-and-shadow-cubes
invariants:
  - "Yards are open-air places, not buildings: no building record, deed or quest place, and their directory type is `yard:<kind>`, never a DFU building type."
  - "Only TownCity and TownHamlet stand yards (YARD_TOWN_TYPES via isYardTown on mapTableData.locationType)."
  - "Kinds are YARD_KINDS stable, transport (Wagon Yard) and carpenter (Joinery); YARD_KIND_ORDER = ['stable','transport'], CRAFT_YARD_ORDER = ['carpenter']."
  - "Nothing about a yard is saved or sent: site comes from the town layout, keeper from the map id, so every client sees the same yard."
traps:
  - "The code kind for the Wagon Yard is 'transport', not 'wagon'; validYardKind rejects anything else."
  - "Many in-code comments cite stale paths (systems/merchantYards.js, scenes/merchantYardsHost.js); the live module is src/world/merchantYards/."
dfu: []
tags:
  - merchant-yards
  - stable
  - wagon-yard
  - joinery
  - town-places
---

# Merchant Yards: Stables, Wagon Yards and the Joinery

Open-air merchant yards stand in cities and hamlets as stateless, deterministic places with procedural art and no DFU building record, deed, or quest slot (`src/world/merchantYards/merchantYards.js`, `src/world/townPlacesWorld.js`).

- **Kinds, town eligibility, and determinism (`src/world/merchantYards/merchantYards.js`, `src/world/townPlacesWorld.js`):** Only `TownCity` and `TownHamlet` stand yards (`YARD_TOWN_TYPES` via `isYardTown` on `mapTableData.locationType`). `YARD_KINDS` defines `stable`, `transport` (Wagon Yard; `validYardKind` rejects `'wagon'`), and `carpenter` (Joinery) with directory type `yard:<kind>`, ordered by `YARD_KIND_ORDER=['stable','transport']` and `CRAFT_YARD_ORDER=['carpenter']`. Sites derive from town layout and keepers from `mapId`, so nothing is saved or sent over the wire.
- **Procedural models, art, and host contexts (`src/world/merchantYards/merchantYardArt.js`, `src/world/merchantYards/merchantYardModels.js`, `src/world/merchantYards/merchantYardsHost.js`, `src/scenes/world.js`, `src/scenes/worldModes.js`):** Procedural textures (`YARD_REC` `10..13`: `signCarpenter`, `shavings`, `endgrain`, `bark`) upload under `YARD_ARCHIVE` (`38221`). Stables build a three-stall lean-to, trough, gate arch, three eight-view horses, and a stablemaster; Wagon Yards build a wainwright shed, signpost, Small Cart, Open Wagon, Caravan (`drawShowWagon`), and a wagonwright. Hung signboards use ray-tested `sight` triangles (`2.4` m high, no collider). `world.js` and `worldModes.js` wire yards; `exterior.js` bench and `dungeonContext.js` stand none.
