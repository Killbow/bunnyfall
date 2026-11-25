---
slug: "wagon-warden-town-watch-overview"
title: "Wagon Warden: Town Watch Parking Caps, Relay Verdicts, and parkYeet"
domain: "travel"
kind: "overview"
parent: null
files:
  - "src/travel/wagonWarden.js"
  - "src/travel/wagon/wagonWardenHost.js"
  - "src/net/wire.js"
  - "src/net/online.js"
  - "server/src/world/park.js"
  - "server/src/message/dispatch.js"
  - "server/src/message/frames/hello.js"
  - "server/src/index.js"
  - "src/travel/horseCart.js"
  - "src/travel/horseCartPool.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagon-Warden.md"
related:
  - "wagon-warden-throw-show"
  - "wagons-caravan-room-paint-and-visits"
  - "wagons-kinds-and-hitching-overview"
invariants:
  - "Only `WARDEN_TOWN_TYPES` (`TownCity`, `TownHamlet`, `TownVillage` in `src/travel/wagonWarden.js`) are policed: road-blocking teams (`>= WARDEN_ROAD_SHARE = 1/3` over `WARDEN_FOOT_STEPS = 3` `ROAD_WEIGHT` cells) are thrown after `WARDEN_ROAD_MS` (`10` min), and towns evict the longest-parked team beyond `WARDEN_TOWN_CAP = 4`."
  - "Lone horses are never thrown; horses within `WARDEN_HORSE_BY_NATIVES` (`480` natives, `12` m) accompany the wagon (`horseThrownWith`) to `WARDEN_LAND_PAST` (`40` m past town edge, `WARDEN_LAND_SCATTER = 12` m via `landingsOf`), preserving cargo, paint, and orientation."
  - "`Room._parkWarden` (`server/src/world/park.js`, gated on `WARDEN_RELAY_MIN = 191`) runs on store, `hello`, and the first frame past `wardenDue` (never on cell alarms; retries after `WARDEN_RETRY_MS = 30` s), preserving `since` within `WARDEN_SPOT_NATIVES` (`40` natives via `parkSameSpot`), clamping `ly` within `WARDEN_LAND_REACH` (`PIXEL_UNITS`), and sending `parkYeet` (`validParkYeet`) to owner sockets (`adoptYeet` in `src/travel/horseCart.js`)."
traps:
  - "Relays below `WARDEN_RELAY_MIN` (`191`) strip `ly`, `tw`, and `rd` from `wardenStamp` and throw nothing."
  - "An account may hold `PARK_ACCOUNT_MAX = 4` parked teams globally, but only one counts toward a town quota; extra same-owner teams in one town are evicted first, and offline saves (`WARDEN_VENDOR = \"WagonWarden\"`) enforce only the road rule (`offlineDue`)."
dfu: []
tags:
  - "wagon"
  - "warden"
  - "town-watch"
  - "park"
  - "parkYeet"
---

# Wagon Warden: Town Watch Parking Caps, Relay Verdicts, and parkYeet

Town Watch parking enforcement (`src/travel/wagonWarden.js`, `src/travel/wagon/wagonWardenHost.js`, `server/src/world/park.js`) polices wagons inside `WARDEN_TOWN_TYPES` (`TownCity`, `TownHamlet`, and `TownVillage`), while park records expire after `PARK_TTL_MS` (`72` h).

- **Road blocking, town caps, and landings (`src/travel/wagonWarden.js`):** Teams occupying at least `WARDEN_ROAD_SHARE` (`1/3`) across `WARDEN_FOOT_STEPS` (`3`) `ROAD_WEIGHT` cells are thrown after `WARDEN_ROAD_MS` (`10` min), and towns evict the oldest parked team beyond `WARDEN_TOWN_CAP` (`4`). An account holds up to `PARK_ACCOUNT_MAX` (`4`) parked teams globally, with extra same-owner teams in one town evicted first; offline saves (`WARDEN_VENDOR = "WagonWarden"`) enforce only the road timer (`offlineDue`). Lone horses are never thrown, whereas horses within `WARDEN_HORSE_BY_NATIVES` (`480` natives, `12` m) accompany the wagon (`horseThrownWith`) to `WARDEN_LAND_PAST` (`40` m past the town edge with `WARDEN_LAND_SCATTER = 12` m via `landingsOf`), keeping cargo, paint, and orientation.
- **Relay execution and `parkYeet` (`server/src/world/park.js`, `src/net/wire.js`, `src/travel/horseCart.js`):** On relays at or above `WARDEN_RELAY_MIN` (`191`; older relays strip `ly`, `tw`, and `rd` from `wardenStamp`), `Room._parkWarden` runs on store, `hello`, and the first frame past `wardenDue` (retrying after `WARDEN_RETRY_MS = 30` s), preserves `since` within `WARDEN_SPOT_NATIVES` (`40` natives via `parkSameSpot`), clamps `ly` within `WARDEN_LAND_REACH` (`PIXEL_UNITS`), and dispatches `parkYeet` (`validParkYeet`) to owner sockets for `adoptYeet`.
