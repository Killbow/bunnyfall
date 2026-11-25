---
slug: shipyards-shipmaster-sales-and-resale
title: "Shipmaster Window: Ship Sales, Buy-Back and Refusals"
domain: economy
kind: subcard
parent: shipyards-crew-halls-and-lighthouses-overview
files:
  - src/systems/naval/shipyards.js
  - src/systems/naval/shipyardHost.js
  - src/ui/shipyardWindow.js
  - src/ui/navalPlunderDoor.js
  - src/systems/naval/comeSailAwayItems.js
  - src/systems/naval/comeSailAwayHulls.js
  - src/systems/naval/comeSailAway.js
  - src/systems/naval/fleet.js
  - src/saves/realmCustoms.js
  - src/trade/shopStock.js
  - src/trade/tradeModes.js
  - src/scenes/worldModes.js
routes: []
tables: []
replacesBible:
  - "03-World/Shipyards.md"
related:
  - shipyards-crew-halls-and-lighthouses-overview
  - holdings-fleet-ledger-titles-and-refits
  - town-economy-resale-cap-and-sea-trade
  - naval-and-come-sail-away
  - economy-ledger-and-item-judge
invariants:
  - "SHIPYARD_HULLS = [0, 1, 2, 4, 3]: Rowboat, Large Boat, Small Ship, Carrack, Large Galley (cheapest first; HULL_PRICES 4,000 / 8,000 / 100,000 / 150,000 / 200,000)."
  - "PARTS_HULLS = [0]: only the Rowboat is sold as parts (mintParts) into the pack; every other hull is a deed (mintDeed) laid up at this port."
  - "Prices: shipBuyPrice / shipSalePrice use calculateCost + getTradePrice at SHIPYARD_QUALITY / SHIPYARD_PRICE_INDEX with live Mercantile and Personality."
  - "shipWorth = (value capped at new hull price + refitGold * REFIT_RESALE 0.5) * k, where k runs from SALE_FLOOR (0.6) for a wreck to 1 for a whole hull; never below 1."
  - "Online sales are capped at half the counter's least ask (calculateTradePrice, ONLINE_SALE_SHARE) and haggle skills are clamped to ONLINE_HAGGLE_MAX; offline keeps DFU haggling."
  - "saleRefusal order: not at port, crossed via customs (fleetCrossed), sailing, away, not here/laidup/packed, fighting, another player aboard, hands ashore, cargo in hold."
  - "shopBuysItem excludes BOAT_PARTS_TEMPLATE and BOAT_DEED_TEMPLATE: General Stores and Pawn Shops neither stock nor buy ships."
traps:
  - "shipWorth caps a record's value at the new-hull price because huge save values overflow the 32-bit haggle into negative offers; shipSalePrice also clamps to >= 0."
  - "Purchase uses a double press: the second press must come at least CONFIRM_MS (350 ms, local to shipyardWindow.js) after the first."
  - "A sale lays the ship up (LayUpBoat), frees the cabin (cabinSold), and purges records (forgetShip, forgetBoat, forgetHold)."
dfu: []
tags:
  - shipyards
  - come-sail-away
  - deeds
  - resale
  - haggle
---

# Shipmaster Window: Ship Sales, Buy-Back and Refusals

The shipmaster counter (`src/systems/naval/shipyards.js`, `src/systems/naval/shipyardHost.js`, and `src/ui/shipyardWindow.js`, wired via `closeShipyard` in `src/ui/navalPlunderDoor.js` and `src/scenes/worldModes.js`) exposes four tabs: `Ships for sale`, `Your fleet`, `Shipwright`, and `Refits`.

- **Catalog, deeds, and confirm press:** `SHIPYARD_HULLS` lists hulls `[0, 1, 2, 4, 3]` (Rowboat, Large Boat, Small Ship, Carrack, and Large Galley in `src/systems/naval/comeSailAwayHulls.js`) at `HULL_PRICES` `4,000`, `8,000`, `100,000`, `150,000`, and `200,000`, with crew capacity driven by `playerCrewCount` (`CREW_SHOWN` cap, one hand per `CREW_PER_HAND = 6`). Because `PARTS_HULLS` is `[0]`, only the Rowboat mints pack parts (`mintParts` in `src/systems/naval/comeSailAwayItems.js`); larger hulls mint a deed (`mintDeed`) laid up at the port. Buying requires a second press at least `CONFIRM_MS` (`350` ms) after the first. In `src/trade/shopStock.js`, `shopBuysItem` blocks `BOAT_PARTS_TEMPLATE` and `BOAT_DEED_TEMPLATE` from General Stores and Pawn Shops.
- **Pricing, refusals, and disposal:** `shipBuyPrice` and `shipSalePrice` call `calculateCost` and `getTradePrice` (`src/trade/tradeModes.js`) at `SHIPYARD_QUALITY` and `SHIPYARD_PRICE_INDEX`. `shipWorth` caps stored value at the new-hull price (preventing 32-bit haggle overflow), adds `refitGold * REFIT_RESALE` (`0.5`), scales by `k` from `SALE_FLOOR` (`0.6`) to `1`, and floors at `1` (`shipSalePrice` clamps to `>= 0`). Online sales cap at `ONLINE_SALE_SHARE` via `calculateTradePrice` with haggle skills clamped to `ONLINE_HAGGLE_MAX`. `saleRefusal` rejects in order: not at port, `fleetCrossed` (`applyCustoms` in `src/saves/realmCustoms.js`), sailing, away, not here/laidup/packed, fighting, another player aboard, hands ashore, or cargo in hold. Selling runs `LayUpBoat` (`src/systems/naval/comeSailAway.js`), `cabinSold`, `forgetShip`, `forgetBoat`, and `forgetHold` (`src/systems/naval/fleet.js`).
