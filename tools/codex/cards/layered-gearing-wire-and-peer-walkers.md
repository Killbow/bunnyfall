---
slug: "layered-gearing-wire-and-peer-walkers"
title: "Layered Gearing Online: Look Field lg and Peer Walker LRU Cache"
domain: "net"
kind: "subcard"
parent: "layered-gearing-overview"
files:
  - "src/net/wire.js"
  - "src/net/remotePlayers.js"
  - "src/net/peerRiders.js"
  - "src/scenes/world.js"
routes: []
tables: []
replacesBible:
  - "04-Characters/Layered-Gearing.md"
related:
  - "layered-gearing-overview"
  - "peer-art-lru-sweep-and-boat-arc-glide"
invariants:
  - "The `lg` look field carries only `1` or `2`: `ownLayeredGear` resolves `LAYERED_OWN` to entity gender before sending and omits `lg` when Layered Gearing is off."
  - "`validLook` (`src/net/wire.js`) accepts `lg` as an unsigned integer at most `2`, and `composeLook` attaches it; the relay deploys before game clients so `lg` is preserved."
traps:
  - "`viewerLayered()` is true only when Eye of the Beholder is enabled and `Graphics.LayeredGear > 0`; peers without `lg` draw in the body matching look gender."
  - "Riders, beast forms, dying players, and Morrowind body stand-ins never draw as layered walkers."
dfu: []
tags:
  - "layered-gear"
  - "wire"
  - "peer-art"
---

# Layered Gearing Online: Look Field lg and Peer Walker LRU Cache

Online multiplayer syncs Layered Gearing body selection across `src/net/wire.js`, `src/net/remotePlayers.js`, `src/net/peerRiders.js`, and `src/scenes/world.js` for remote paperdoll walkers.

- **Wire look field (`src/net/wire.js`, `src/scenes/world.js`):** The `lg` look field carries `1` or `2`; `ownLayeredGear` resolves `LAYERED_OWN` to entity gender before sending and omits `lg` when off. `validLook` accepts `lg` as an unsigned integer at most `2`, and `composeLook` attaches it; the relay deploys before game clients so `lg` is preserved. Cloaks use standard equip slot and dye fields.
- **Peer walker gating (`src/net/remotePlayers.js`):** `viewerLayered()` holds only when Eye of the Beholder is enabled and `Graphics.LayeredGear > 0`. Peers lacking `lg` draw in the body matching look gender. Riders, beast forms, dying players, and Morrowind body stand-ins never render as layered walkers.
- **LRU outfit bounds (`src/net/peerRiders.js`):** Peer walker caches cap memory via `RIDER_LOOKS_KEPT = 12`, `RIDER_LOOK_IDLE_MS = 2000`, and `RIDER_PIXELS_KEPT = 64`, keying outfits by `spriteLookOf` and sparing looks drawn in the current or previous frame.
