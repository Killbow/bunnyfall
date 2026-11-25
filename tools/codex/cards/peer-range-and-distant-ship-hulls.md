---
slug: peer-range-and-distant-ship-hulls
title: "Peer Range Tiers, Distant Hull Shedding, and Far Boat Cadence"
domain: rendering
kind: subcard
parent: performance-priority-overview
files:
  - src/net/peerRange.js
  - src/ui/uiPrefs.js
  - src/ui/enhancedMenu.js
  - src/systems/naval/navalHost.js
  - src/systems/naval/farLife.js
  - src/systems/naval/comeSailAwayPool.js
  - src/systems/naval/comeSailAwayPeers.js
  - src/world/prefabNode.js
  - src/world/prefabColliders.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Priority.md"
related:
  - performance-priority-overview
  - naval-and-come-sail-away
  - horse-teams-pose-cadence-and-dye-budget
invariants:
  - "PEER_RANGE_TIERS = [150, 300, 600, 0] (0 = everyone), default 300; PEER_RANGE_HOLD = 1.1 keeps already-drawn players."
  - "Party mates and the current duel opponent are always drawn regardless of range."
  - "Peer hulls rebuild within PEER_HULL_NEAR_M = 5000 and shed past PEER_HULL_FAR_M = 5500 unless hullKept (deck bodies, boarding, live prize, engage/board mode, or fought)."
traps:
  - "Shedding a hull must keep the ship's navigation and damage records."
  - "Far boats beyond NEAR_LIFE_M = 600 step every FAR_LIFE_EVERY = 4 frames; a changed prefabShapeStamp or prefabSwitchStamp must invalidate the held walk."
dfu: []
tags:
  - peers
  - range
  - naval
  - hulls
  - cadence
---

# Peer Range Tiers, Distant Hull Shedding, and Far Boat Cadence

Multiplayer and naval scenes cap distant rendering work through configurable peer draw radii, hysteresis, distant ship hull shedding, and reduced update cadence for far vessels.

## Peer Visibility Range and Exceptions

- **Range tiers and hold hysteresis (`peerRange.js`, `uiPrefs.js`, `enhancedMenu.js`):** Player draw distance selects from `PEER_RANGE_TIERS = [150, 300, 600, 0]`, where `0` draws everyone and `300` meters is the default. Already-visible peers stay rendered up to `PEER_RANGE_HOLD = 1.1` times the active threshold to prevent boundary flicker.
- **Pinned peers (`peerRange.js`):** Party members and the active duel opponent bypass distance culling and always draw.

## Distant Hull Shedding and Far Boat Cadence

- **Hull rebuild and shedding (`navalHost.js`, `comeSailAwayPool.js`, `comeSailAwayPeers.js`):** `shedFarHulls` drops 3D peer hull meshes beyond `PEER_HULL_FAR_M = 5500` meters and rebuilds them inside `PEER_HULL_NEAR_M = 5000` meters. A hull is retained whenever `hullKept` is true (active deck bodies, boarding, a live prize, engage or board mode, or an already-fought ship). Shedding frees geometry while preserving navigation and damage records. Distant captain AI ticks at `FRAME_STEP_S = 0.1` seconds within `FAR_WATCH_M = 5500` meters.
- **Far boat stepping (`farLife.js`, `prefabNode.js`, `prefabColliders.js`):** Past `NEAR_LIFE_M = 600` meters, `createBoatLives`, `farLifeStep`, and `farTreeStep` advance distant boats every `FAR_LIFE_EVERY = 4` frames while `heldShift` reuses held batches. Changing `prefabShapeStamp` or `prefabSwitchStamp` invalidates the held walk.
