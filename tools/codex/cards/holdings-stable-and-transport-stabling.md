---
slug: holdings-stable-and-transport-stabling
title: "Stable Page: Summon, Send Away, Rename, and Stabled Flags"
domain: world
kind: subcard
parent: holdings-tab-overview
files:
  - src/travel/horseCart.js
  - src/travel/horseCartLaw.js
  - src/ui/holdingsPages.js
routes: []
tables: []
replacesBible:
  - "03-World/Holdings.md"
related:
  - holdings-tab-overview
  - items-gold-counter-and-wagon
  - living-world-ii-wagon-trains-and-caravan-counters
invariants:
  - "A stabled wagon (`wagonState.WagonStabled`) never deploys outside an interior or dungeon door and never joins a fast-travel journey (`wagonGoesOnJourney` returns false when `WagonStabled` is true under `WAGON_MODE.WithPlayer`)."
  - "Mounting a horse leaves a stabled wagon at the stable because `deployWagonBeforeHorseTravel` skips deployment when `WagonStabled` is true."
  - "Placing the wagon or horse directly into the world clears its stabled flag (`resetWagonState` and `setHorseLoose`)."
traps:
  - "Never infer stabled state from `WAGON_MODE.WithPlayer` alone; `WithPlayer` applies both when transport travels beside the player and when it rests at the stable, so door deployment and travel checks must inspect `WagonStabled` and `HorseStabled`."
dfu: []
tags:
  - holdings
  - horse
  - wagon
  - stable
  - fast-travel
---

# Stable Page: Summon, Send Away, Rename, and Stabled Flags

The `stable` section (`src/ui/holdingsPages.js`) exposes remote horse and wagon management backed by `src/travel/horseCart.js` and pure state rules in `src/travel/horseCartLaw.js`.

## Provider Actions and Stabled State

`stableProviderFor` adapts four runtime entry points into the Stable page view (`stableView`) and its three verbs (`summon`, `send`, and `rename`):

- **Send away (`sendTransportAway`):** Marks the owned horse and wagon as stabled by setting `HorseStabled` and `WagonStabled` on the transport state without deleting the underlying ownership or wagon inventory records from the save.
- **Summon (`summonTransport`):** Clears the stabled flags and brings the horse and wagon back to the player in the exterior world.
- **Rename (`renameHorse`):** Validates and persists a custom display name for the player's horse.

## Door Deployment and Fast-Travel Rules

Because `WAGON_MODE.WithPlayer` represents an owned wagon whether it is following the player or resting at the stable, transition and travel hooks check `wagonState.WagonStabled` and `HorseStabled` explicitly:

- **Interior and dungeon exits:** Exiting a building or dungeon door leaves a stabled wagon at the stable rather than spawning it outside the door.
- **Horse mounting (`deployWagonBeforeHorseTravel`):** Mounting a horse skips auto-deploying the wagon whenever `WagonStabled` is true.
- **Fast travel (`wagonGoesOnJourney`):** Returns true under `WAGON_MODE.WithPlayer` only when `WagonStabled` is false.
- **World placement (`resetWagonState`, `setHorseLoose`):** Any direct world placement of the wagon or horse clears its stabled flag.
