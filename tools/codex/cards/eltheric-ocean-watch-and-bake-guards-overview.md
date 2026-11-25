---
slug: eltheric-ocean-watch-and-bake-guards-overview
title: "Eltheric Ocean Watch Ground, Overworld Lists, and Veil Boarding"
domain: world
kind: overview
parent: null
files:
  - src/net/watchReceipt.js
  - src/net/motherlodeLaw.js
  - src/net/nodeLaw.js
  - src/travel/travelViewWorld.js
  - src/world/etherWatersBake.js
  - src/world/deepWatersBake.js
  - server-account/src/motherlodes.js
  - src/travel/travelViewDungeonModels.js
  - src/travel/travelBands.js
  - src/systems/naval/captainLedger.js
  - src/scenes/world.js
  - src/world/etherPlaces.js
routes: []
tables:
  - motherlodes
  - motherlode_days
  - motherlode_strikes
replacesBible:
  - "01-Overview/audits/Audit-Ether-OW.md"
related:
  - eltheric-ocean-deep-water-bake-planes
  - eltheric-ocean-overview
  - eltheric-ocean-isles-places-and-depth-bake
  - eltheric-ocean-open-pvp-zone-and-crossing
  - captains-sea-overview
invariants:
  - "A Motherlode site must be a pixel a Watch receipt can name (watchPixelOk)."
  - "Bay bake output is unchanged by the Eltheric bake; Bay rows are never adopted past the Veil."
  - "'Your Ship' boarding past the Veil is refused (veilRefused)."
  - "watchPixelOk(x,y) requires safe integers inside the 1000x500 Bay map; motherlodeLaw and the relay gate share it."
  - "Overworld list caches key on tvKnownGen = discoveryGeneration() + captainLedger.chartedCount()."
  - "Past-Veil raiders spawn only when tvRaidOpen (sea fight positions the ship)."
traps:
  - "Do not let isle pixels become Motherlode candidates; relay mints receipts on the Bay map alone."
  - "Keying lists on pixel alone leaves plates stale after charting on the current pixel."
dfu: []
tags:
  - eltheric
  - veil
  - motherlode
  - watch
  - raiders
---

# Eltheric Ocean Watch Ground, Overworld Lists, and Veil Boarding

Coordinates past the Veil sit outside the `1000 x 500` Iliac Bay grid, so Watch receipts, Motherlode candidate selection, Overworld travel lists, boarding prompts, and seabed plane caches enforce explicit boundary guards across Bay and Eltheric waters.

## Watch Receipts and Motherlode Ground

- **Bay-only Watch receipts (`src/net/watchReceipt.js`, `src/net/motherlodeLaw.js`, `server-account/src/motherlodes.js`):** Both the relay gate and `motherlodeLaw` validate sites with `watchPixelOk(x, y)`, which requires safe integer coordinates inside the `1000 x 500` Bay map. Because the relay mints Watch receipts on Bay pixels alone, procedural Eltheric isle pixels cannot become Motherlode sites in the `motherlodes`, `motherlode_days`, and `motherlode_strikes` tables. In `src/net/nodeLaw.js`, `regionWritTable` reads isle ores as region `19` (Betony) writs (`src/world/etherPlaces.js`).

## Overworld List Keys, Raiders, and Boarding

- **Chart generation key (`src/travel/travelViewWorld.js`, `src/travel/travelViewDungeonModels.js`, `src/systems/naval/captainLedger.js`):** Overworld list caches key on `tvKnownGen = discoveryGeneration() + captainLedger.chartedCount()` rather than pixel coordinates alone, ensuring nameplates refresh immediately after charting an isle on the current pixel.
- **Boarding and raider gates (`src/scenes/world.js`, `src/travel/travelBands.js`):** Direct `'Your Ship'` boarding is refused past the Veil (`veilRefused`), and past-Veil raiders spawn only when `tvRaidOpen` is active so the sea fight positions the ship.
