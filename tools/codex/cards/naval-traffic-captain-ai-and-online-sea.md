---
slug: naval-traffic-captain-ai-and-online-sea
title: "Sea Traffic Director, Captain AI, and Shared Online Sea"
domain: world
kind: subcard
parent: naval-combat-overview
files:
  - src/systems/naval/navalDirector.js
  - src/systems/naval/navalAI.js
  - src/systems/naval/navalWire.js
  - src/systems/naval/navalRaiders.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/seaLanes.js
routes: []
tables: []
replacesBible:
  - "03-World/Naval-Combat.md"
related:
  - naval-combat-overview
  - peer-range-and-distant-ship-hulls
  - spyglass-ship-knowledge-and-false-colours
invariants:
  - "Traffic rolls use `trafficSeconds` on the real clock, independent of Overworld time compression."
  - "Only the `launchesTraffic` peer on the water launches traffic; every client despawns its own non-fighting ships past `DESPAWN_BEYOND` (`1900` m)."
  - "Shared density uses peers within `NAVAL_SHARE_RADIUS` (`1200` m) with `SHARE_HYSTERESIS` (`1.25`)."
  - "`NAVAL_WIRE_OLD_CLASSES` (`15`) bounds the class indices on the legacy s/f/w arrays; fishing boats use wire key `h`, and spent lane voyages use `l`."
traps:
  - "Captain AI `layMin` keeps AI out of the galley dead zone; `fightingPower` and `odds` include crew losses."
  - "Cross-player hits go through `navalHitData` and the retry queue; each client damages only its own boat."
dfu: []
tags:
  - naval
  - ai
  - traffic
  - online
  - wire
---

# Sea Traffic Director, Captain AI, and Shared Online Sea

The traffic director, captain AI, and naval room wire coordinate ship spawns, maneuver decisions, and multiplayer synchronization across open water and sea lanes.

- **Traffic Rolls and Faction Weights (`src/systems/naval/navalDirector.js`, `src/systems/naval/navalRaiders.js`, `src/systems/naval/seaLanes.js`):** Spawn checks advance on `trafficSeconds` in real time, unaffected by Overworld time compression. `DENSITY` maps `off` (`0`), `few` (`1`), `some` (`2`), and `many` (`4`), rolling every `SPAWN_EVERY` (`[60, 140]` s) after `FIRST_ROLL_S` (`30` s). Open-sea `FACTION_WEIGHTS` are pirate `30`, merchant `45`, and navy `25`, while `PORT_WEIGHTS` use merchant `30` and navy `15` with `PORT_PIRATE_K` (`0.5`). `RAIDER_SHIPS_MAX` caps active raider ships at `1`.
- **Captain AI (`src/systems/naval/navalAI.js`):** AI captains enforce `layMin` when steering so vessels stay out of the galley firing dead zone, and both `fightingPower` and `odds` evaluations account for current crew losses.
- **Online Authority and Wire Sync (`src/systems/naval/navalWire.js`, `src/systems/naval/navalHost.js`):** Only the designated `launchesTraffic` peer on the water spawns traffic, shared density groups peers within `NAVAL_SHARE_RADIUS` (`1200` m) using `SHARE_HYSTERESIS` (`1.25`), and each client despawns its own non-fighting ships past `DESPAWN_BEYOND` (`1900` m). `NAVAL_WIRE_OLD_CLASSES` (`15`) bounds legacy `s`/`f`/`w` class indices while fishing boats use key `h` and spent lane voyages use `l`, within caps `NAVAL_WIRE_SHIPS` (`8`), `NAVAL_WIRE_VOLLEYS` (`12`), `NAVAL_WIRE_SPENT` (`8`), and `NAVAL_WIRE_GONE` (`8`). Cross-player hits route through `navalHitData` so each client damages only its own boat.
