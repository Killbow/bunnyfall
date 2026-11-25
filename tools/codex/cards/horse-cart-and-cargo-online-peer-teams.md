---
slug: "horse-cart-and-cargo-online-peer-teams"
title: "Peer Teams Online: the hv Record, Grounding, Yielding Rays, and Riders"
domain: "multiplayer"
kind: "subcard"
parent: "horse-cart-and-cargo-overview"
files:
  - "src/travel/horseCartWire.js"
  - "src/travel/horseCartPool.js"
  - "src/travel/horseCartWorld.js"
  - "src/net/onlineWorld.js"
  - "src/net/wire.js"
  - "src/player/activate.js"
  - "src/worldEvents/eventGround.js"
  - "src/net/remotePlayers.js"
  - "src/player/motor.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Cart-And-Cargo.md"
related:
  - "horse-cart-and-cargo-overview"
  - "horse-cart-and-cargo-park-persistence"
  - "online-coop-party-quest-trade-and-ally-cast"
  - "portal-stone-online-event-ground-and-gift"
  - "wagons-open-wagon-riders-and-seats"
  - "horse-coats-overview"
invariants:
  - "Peer teams ride as `hv` on cell `foes` frames (`src/net/onlineWorld.js`), resent only when `shared._hccDirty` is set; wagon cargo contents never cross the wire."
  - "validHccRecord rebuilds the record from w, h and n, so an older reader drops unknown top-level fields (wk, wh, wl, we, wg, hc, ps)."
  - "Horse names ride through sanitizeLabel(name, HORSE_NAME_MAX), which keeps printable ASCII and applies the name filter."
  - "Peer wagons ease with easeToward(shown, target, dt, rate = 12, snap = 20). A gap over 20 m snaps."
traps:
  - "Peer wagon and horse activation targets set `yields: true` so `firmFirst` (`src/player/activate.js`) passes rays through to firm targets behind them, testing peer wagons against an `obb` (`rayObb`)."
  - "Deployed peer wagons inside `eventGroundAt(position)` (`EVENT_GROUND_M = 40` in `src/worldEvents/eventGround.js`) set `p.offGround` and neither draw nor activate."
  - "`groundPeer` regrounds parked peer wagons and horses onto local viewer terrain, while `hccGroundMoved` and `regroundStanding` reground local teams on terrain shifts."
dfu: []
tags:
  - "horse-cart-and-cargo"
  - "online"
  - "peers"
  - "pr-wagon1"
  - "gate-way"
  - "ride"
---

# Peer Teams Online: the hv Record, Grounding, Yielding Rays, and Riders

Peer horses and wagons sync across `src/travel/horseCartWire.js`, `src/travel/horseCartPool.js`, `src/travel/horseCartWorld.js`, `src/net/onlineWorld.js`, and `src/net/wire.js`.

- **Wire format and easing:** Peer teams broadcast as `hv` on cell `foes` frames whenever `shared._hccDirty` is set, encoding `HCC_WIRE_KIND` (`Trailing = 1`, `Deployed = 2`, `Following = 3`), wagon state (`w`: kind, base position, rotation, cargo tier, wheel angle; cargo items never cross the wire), horse state (`h`: base, horizontal forward, walking bit without walk frame), and `sanitizeLabel(name, HORSE_NAME_MAX)` (`n`). `validHccRecord` rebuilds from `w`, `h`, and `n` so older readers drop unknown top-level keys (`wk`, `wh`, `wl`, `we`, `wg`, `hc`, `ps`). Peer wagons interpolate via `easeToward(shown, target, dt, rate = 12, snap = 20)`.
- **Grounding, yielding rays, and riders:** `groundPeer` regrounds parked peer teams onto viewer terrain, while `hccGroundMoved` and `regroundStanding` reground local teams. Peer targets set `yields: true` (`obb` via `rayObb`, `ACTIVATION_REACH = 3.2` m, owner tooltip in `horseCartPool.js`) so `firmFirst` (`src/player/activate.js`) reaches firm targets behind them. Deployed peer wagons inside `eventGroundAt(position)` (`EVENT_GROUND_M = 40`, `src/worldEvents/eventGround.js`) set `p.offGround`. Mounted peers validate pose fields `rd` and `rv` (`0` to `4`), fire from `RIDE_EYE_HEIGHT` (`src/player/motor.js`), play `RidingAnimator` hooves (`src/net/remotePlayers.js`), and retry rider art after `RIDER_RETRY_MS = 30000`.
