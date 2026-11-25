---
slug: "come-sail-away-online-peer-boats-and-aboard"
title: "Online Peer Boats, Wire Caps, and Riding Aboard"
domain: "multiplayer"
kind: "subcard"
parent: "come-sail-away-overview"
files:
  - "src/systems/naval/comeSailAwayWire.js"
  - "src/systems/naval/comeSailAwayPeers.js"
  - "src/systems/naval/comeSailAwayAboard.js"
  - "src/characters/foeReach.js"
  - "src/characters/exteriorFoes.js"
  - "src/net/wire.js"
  - "src/net/online.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "03-World/Come-Sail-Away.md"
related:
  - "come-sail-away-overview"
  - "peer-range-and-distant-ship-hulls"
  - "naval-traffic-captain-ai-and-online-sea"
invariants:
  - "`CSA_WIRE_BOATS_MAX` equals `POSE_ABOARD_SLOTS` (8) in `src/net/wire.js`; `CSA_WIRE_SAILS_MAX` = 16."
  - "`CSA_WIRE_SPEED_MAX` = 2 * 1024 * 1024 natives/s; faster way vectors are scaled to 0.999 of the cap."
  - "Peer easing: `CSA_PEER_SNAP_M` 20, `CSA_PEER_SNAP_S` 2.5, `CSA_PEER_LEAD_MAX` = (2 * `FOES_FULL_MS`) / 1000, `CSA_PEER_CATCH` 1, `CSA_PEER_CATCH_MPS` 0.3, `CSA_PEER_CATCH_SHARE` 0.25."
traps:
  - "Never hardcode the relay version string; pose `ab` fields ride the frame versioned by `RELAY_VERSION` in `src/net/wire.js`."
  - "Buildings and dungeons carry no `sa` peer boats; do not assume peer boats exist outside the exterior."
dfu:
  - "Assets/Scripts/Game/MagicAndEffects/Effects/Thaumaturgy/WaterWalking.cs"
tags:
  - "come-sail-away"
  - "multiplayer"
  - "peers"
  - "wire"
---

# Online Peer Boats, Wire Caps, and Riding Aboard

Multiplayer boat replication, velocity clamping, dead-reckoned hull easing, and passenger boarding run across `src/systems/naval/comeSailAwayWire.js`, `src/systems/naval/comeSailAwayPeers.js`, `src/systems/naval/comeSailAwayAboard.js`, `src/net/wire.js`, `src/net/online.js`, and `src/scenes/world.js`.

- **Wire encoding and speed caps:** Exterior owner boats broadcast on the `foes` frame under `sa`, while passenger deck offsets (`ab`) ride `pose` and `foes` frames tagged with `RELAY_VERSION` from `src/net/wire.js` (buildings and dungeons carry no `sa` peer boats). Each frame packs up to `CSA_WIRE_BOATS_MAX` (`8`, matching `POSE_ABOARD_SLOTS`) boats and `CSA_WIRE_SAILS_MAX` (`16`) sail states. Way vectors exceeding `CSA_WIRE_SPEED_MAX` (`2 * 1024 * 1024` natives/s) scale down to `0.999` of the cap.
- **Peer easing, boarding, and water reach:** Remote hulls dead-reckon and ease using `CSA_PEER_SNAP_M` (`20` m), `CSA_PEER_SNAP_S` (`2.5` s), `CSA_PEER_LEAD_MAX` (`(2 * FOES_FULL_MS) / 1000`), `CSA_PEER_CATCH` (`1`), `CSA_PEER_CATCH_MPS` (`0.3` m/s), and `CSA_PEER_CATCH_SHARE` (`0.25`). `src/systems/naval/comeSailAwayAboard.js` casts down `CSA_ABOARD_BELOW` (`3` m) against boat colliders to detect deck riders; passengers can trigger doors, status, bed, and position, but cannot take the helm, open cargo, or switch variants. While the player is afloat, `markFoeReach` and `foeInWater` (`src/characters/foeReach.js` and `src/characters/exteriorFoes.js`) mark water-bound enemies unreachable.
