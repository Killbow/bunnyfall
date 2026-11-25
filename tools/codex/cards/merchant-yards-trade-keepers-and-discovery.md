---
slug: merchant-yards-trade-keepers-and-discovery
title: "Merchant Yard Counters, Keepers, Joinery Bench and Discovery"
domain: economy
kind: subcard
parent: merchant-yards-overview
files:
  - src/world/merchantYards/merchantYards.js
  - src/world/merchantYards/merchantYardsHost.js
  - src/world/merchantYards/merchantYardMap.js
  - src/scenes/worldModes.js
  - src/trade/shopStock.js
  - src/trade/tradeModes.js
  - src/talk/topicTree.js
  - src/travel/portPlaces.js
  - src/travel/travelViewFilters.js
  - src/ui/travelViewHud.js
  - src/ui/profPages.js
routes: []
tables: []
replacesBible:
  - "03-World/Merchant-Yards.md"
related:
  - merchant-yards-overview
  - merchant-yards-placement-and-ground
  - horse-care-keep-stables-and-yards
  - economy-ledger-and-item-judge
  - market-vendors-and-professions
invariants:
  - "yardCounter prices at YARD_QUALITY 10 and YARD_PRICE_INDEX 1000 both ways, so regional index arbitrage is closed."
  - "yardStock: stable = stableHorses (STABLE_HORSES_OFFERED 3, seeded by mapId, day, stall, owned seeds skipped) plus YARD_OATS_STACK 20 oats when upkeep items are on; transport = WAGON_KIND_ORDER wagons plus YARD_KITS_STACK 5 repair kits; carpenter = []."
  - "yardBuysItem: stable buys TRANSPORT_HORSE only, transport buys isWagonItem only, carpenter buys nothing; loaded wagons are refused by sellGuardOf."
  - "General Stores no longer shelve or buy horses, carts or wagons (src/trade/shopStock.js)."
  - "Directory keys are YARD_KEY_BASE (1 << 25) + YARD_KEY_SLOT { stable 0, transport 1, carpenter 6 }, above BUILDING_KEY_0 (1 << 24)."
traps:
  - "Steal is refused at the window too: yardCounter.noSteal feeds openTradeWindow stealRefusal; without it a stolen Caravan sold back was unlimited gold."
  - "openYardTrade queues only one pending press (the latest) while counter art and font load, and drops it if the player left the street or opened talk."
  - "Joinery steal text is CARPENTER_STEAL_TEXT, not YARD_TEXT.steal."
dfu: []
tags:
  - merchant-yards
  - trade
  - keepers
  - joinery
  - discovery
---

# Merchant Yard Counters, Keepers, Joinery Bench and Discovery

Merchant yard keepers run fixed-index trade counters and the Joinery workbench while registering in town talk, automaps, and overworld HUD marks (`src/world/merchantYards/merchantYards.js`, `src/world/merchantYards/merchantYardsHost.js`).

- **Counters, stock, and workbench (`src/world/merchantYards/merchantYards.js`, `src/world/merchantYards/merchantYardsHost.js`, `src/scenes/worldModes.js`, `src/trade/shopStock.js`, `src/trade/tradeModes.js`, `src/ui/profPages.js`):** `yardCounter` fixes `YARD_QUALITY=10`, `YARD_PRICE_INDEX=1000`, and `noSteal` (`openTradeWindow` `stealRefusal`; Joinery uses `CARPENTER_STEAL_TEXT`). `yardStock` gives `stable` `stableHorses` (`STABLE_HORSES_OFFERED=3` by `mapId`, day, and stall, skipping owned seeds) plus `YARD_OATS_STACK=20` oats, `transport` `WAGON_KIND_ORDER` wagons plus `YARD_KITS_STACK=5` repair kits, and `carpenter` `[]`. `yardBuysItem` accepts only `TRANSPORT_HORSE` or unloaded `isWagonItem` (`sellGuardOf`), and General Stores never trade mounts or wagons. Rows offer Buy/Sell, Buy/Sell/Mend (`YARD_MEND_ROW`), or Workbench (`YARD_BENCH_ROW`, `WORKBENCH_FEE=50`, `focusStoresStation`). `openYardTrade` retains one pending press within `YARD_REACH=6.4` m (`workbenchNear` adds `YARD_BENCH_RISE=2` m).
- **Keepers, talk, and maps (`src/world/merchantYards/merchantYardMap.js`, `src/talk/topicTree.js`, `src/travel/portPlaces.js`, `src/travel/travelViewFilters.js`, `src/ui/travelViewHud.js`):** `townKeeper` (`yardSeed(mapId,kind)`) assigns region name, gender, outfit, `walkerRace(people,regionIndex)`, and `namedAfter` (`yardName`). Keys use `YARD_KEY_BASE` (`1<<25`) plus `YARD_KEY_SLOT` `{stable:0,transport:1,carpenter:6}` above `BUILDING_KEY_0` (`1<<24`), grouped by `FOUND_KIND_ORDER` and `YARD_TALK_GROUPS` (`yardDirectoryRows`). `yardTownBlocks` paints `YARD_MAP_BYTE` (`GeneralStore+1`), and `overworldMarks` draws `yardGlyph` at `YARD_MARK_LIFT=4` m under the Towns filter.
