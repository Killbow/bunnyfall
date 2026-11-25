---
slug: "wagon-warden-throw-show"
title: "Wagon Warden Throw Show: Guard Approach, Overhead Lift, and Tumble Arc"
domain: "travel"
kind: "subcard"
parent: "wagon-warden-town-watch-overview"
files:
  - "src/travel/wagon/wagonWardenShow.js"
  - "src/travel/wagon/wagonWardenHost.js"
  - "src/travel/horseCartPool.js"
  - "src/net/caravanVisitLink.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Wagon-Warden.md"
related:
  - "wagon-warden-town-watch-overview"
  - "wagons-open-wagon-riders-and-seats"
  - "wagons-caravan-room-paint-and-visits"
invariants:
  - "During a throw animation (`src/travel/wagon/wagonWardenShow.js`), `horseCartPool.holdTeam` suppresses normal team rendering, collision, raycasts, and seating while `drawShowWagon` renders the lifted wagon inside `PEER_TEAM_DRAW_M` (`400` m)."
  - "`tumbleTurns` rounds to an integer turn count so thrown wagons always land upright along `arcPoint`, `arcPeak`, and `flightSeconds`."
  - "Throws beyond `WARDEN_SHOW_REACH` (`200` m) skip the visual show and relocate the parked record immediately (`thrownRecord`)."
traps:
  - "Guard sprite loading waits up to `SHOW_ART_WAIT` (`1.5` s); if art times out, the throw arc plays without a visible guard rather than stalling relocation."
dfu: []
tags:
  - "warden"
  - "animation"
  - "guard"
  - "throw"
---

# Wagon Warden Throw Show: Guard Approach, Overhead Lift, and Tumble Arc

When a Town Watch eviction fires within `WARDEN_SHOW_REACH` (`200` m), `src/travel/wagon/wagonWardenShow.js` and `src/travel/wagon/wagonWardenHost.js` stage a guard approach, overhead lift, and parabolic throw arc in `src/scenes/world.js`. Evictions beyond `WARDEN_SHOW_REACH` bypass the visual sequence and relocate the parked team immediately via `thrownRecord`.

- **Guard approach, lift, and art fallback (`src/travel/wagon/wagonWardenShow.js`, `src/travel/wagon/wagonWardenHost.js`):** A Town Watch guard jogs along `findTownPath` at `WARDEN_GUARD_SPEED` (`3.2` m/s) from `WARDEN_APPROACH_FROM` (`18` m, capped at `WARDEN_APPROACH_MAX = 7` s), hoists the wagon over `WARDEN_LIFT_S` (`1.4` s) to `WARDEN_HEAD` (`1.85` m), and winds up for `WARDEN_TURN_S` (`0.7` s). Guard sprite loading waits up to `SHOW_ART_WAIT` (`1.5` s); if the sprite times out, the flight arc proceeds without a visible guard so relocation never stalls.
- **Pool hold, tumble flight, and caravan visits (`src/travel/horseCartPool.js`, `src/net/caravanVisitLink.js`):** Throughout the show, `horseCartPool.holdTeam` disables standard team rendering, collision, raycasts, and bench seating while `drawShowWagon` draws the airborne wagon within `PEER_TEAM_DRAW_M` (`400` m). The flight trajectory (`arcPoint`, `arcPeak`, and `flightSeconds`) rounds `tumbleTurns` to a whole integer so the wagon lands upright, and relocated caravans remain enterable at the landing spot through `caravanRecordOf`.
