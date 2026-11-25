---
slug: harbour-board-ports-exchange-and-charts
title: "Harbor Board Contracts, Coastal Ports, Commodity Exchange, and Treasure Charts"
domain: economy
kind: subcard
parent: captains-sea-overview
files:
  - src/systems/naval/harbourBoard.js
  - src/systems/naval/tradeGoods.js
  - src/systems/naval/treasureCharts.js
  - src/travel/portPlaces.js
  - src/world/portSites.js
  - src/net/fortLaw.js
  - src/trade/shopStock.js
  - src/systems/naval/harbourOffice.js
  - src/scenes/world.js
  - src/systems/naval/navalHost.js
routes: []
tables: []
replacesBible:
  - "03-World/Captains-Sea.md"
related:
  - captains-sea-overview
  - naval-refit-overview
  - economy-ledger-and-item-judge
  - captain-log-crown-standing-and-marque
invariants:
  - "`boardFor` seeds `mulberry32` from `hashKey(port.key)`, the world day (`floor(worldMinutes / 1440)`), and `BOARD_SALT` so every client generates identical daily contract offers."
  - "`navalPortList` filters `PORT_LOCATION_IDS` through `isPortTownType` (`PORT_TOWN_TYPES`) and `seaBears(openSea)` within `SEA_RING` (`2`), excluding inland capitals and lake towns."
  - "`boardPortAt` selects the closest port within the Chebyshev `SEA_RING` by strict squared Euclidean distance (`<`)."
  - "A captain can hold at most `CONTRACTS_MAX` (`3`) contracts; term expiry costs `STANDING_FAILED` (`-3`), abandonment costs `STANDING_ABANDONED` (`-1`), and voided contracts cost `0`."
  - "`GOODS` defines `8` Iliac Bay commodities and `3` Eltheric exotics (`ether: true`) starting at template `GOODS_TEMPLATE` (`1331`); `src/trade/shopStock.js` rejects every `goodOfTemplate` item."
  - "`buyGood` clamps quantity by `roomFor` so purchased cargo never pushes the vessel to its stop weight."
traps:
  - "Activating a treasure chart (`CHART_TEMPLATE = 1342`) calls `readChart` and consumes the inventory item only if `markChart` succeeds; `markChart` refuses once `CHARTS_MAX` (`8`) charts are active."
dfu: []
tags:
  - harbor-board
  - contracts
  - ports
  - trade-goods
  - treasure-charts
---

# Harbor Board Contracts, Coastal Ports, Commodity Exchange, and Treasure Charts

Harbor offices connect coastal port detection, deterministic daily contract boards, bulk commodity trading, and salvage treasure charts (`src/systems/naval/harbourBoard.js`, `src/systems/naval/tradeGoods.js`, and `src/systems/naval/treasureCharts.js`).

- **Coastal ports (`src/scenes/world.js`, `src/travel/portPlaces.js`, `src/world/portSites.js`):** At runtime, `navalPortList` filters `PORT_LOCATION_IDS` by `isPortTownType` (`PORT_TOWN_TYPES`: `TownCity`, `TownHamlet`, and `TownVillage`) and `seaBears(openSea)` within `SEA_RING` (`2`), yielding the observed coastal ports while dropping inland and lake settlements. `boardPortAt` picks the nearest port within `SEA_RING` by squared Euclidean distance.
- **Contracts (`harbourBoard.js`, `harbourOffice.js`):** `boardFor` rolls `BOARD_OFFERS` (`3`) daily assignments across `HARBOUR_CONTRACT_KINDS` (`bounty`, `hunt`, `delivery`, `salvage`, and `survey`) with base pay `PAY_BASE` (`150`, `85`, `14`, `65`, `50`) and level scaling `PAY_LEVEL` (`0.12`). Deliveries require at least `DELIVERY_PX_MIN` (`6` pixels) and allow `DELIVERY_DAYS_BASE` (`2` days) plus `1` day per `DELIVERY_PX_DAY` (`6` pixels). `holdContract` caps active contracts at `CONTRACTS_MAX` (`3`), while `contractEvent`, `expireContracts`, and `abandonContract` settle completion, expiry (`STANDING_FAILED = -3`), abandonment (`STANDING_ABANDONED = -1`), or voiding (`0`).
- **Commodity exchange and treasure charts (`tradeGoods.js`, `treasureCharts.js`, `shopStock.js`):** `GOODS` spans `8` Bay goods and `3` Eltheric exotics (`ether: true`) from `GOODS_TEMPLATE` (`1331`), blocked from land shops by `goodOfTemplate`. Port prices apply `MADE_K` (`0.6`), `WANT_K` (`1.55`), `EXOTIC_K` (`1.4`), and `PRICE_DRIFT` (`0.12`) under daily `DAY_STOCK` caps, while `buyGood` respects `roomFor`. Prize plunder drops charts (`CHART_TEMPLATE = 1342`) at `CHART_CHANCE` (`pirate: 0.08`, `deep: 0.18`, `flagship: 0.6`); `readChart` and `markChart` (up to `CHARTS_MAX = 8`, retrying `CHART_PORT_TRIES`) place a water cache paying `CACHE_GOLD` (`250 + 60 * level`) and `CACHE_LOTS` (`2`).
