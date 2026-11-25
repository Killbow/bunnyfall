---
slug: players-shown-cut-player-readers
title: "Crowd Count Cut-Player Hiding for Mounts, Boats, and Readers"
domain: multiplayer
kind: subcard
parent: players-shown-crowd-count-overview
files:
  - src/net/gateCrowd.js
  - src/scenes/world.js
  - src/travel/horseCartWorld.js
  - src/characters/foesWorld.js
  - src/combat/combatVisuals.js
  - src/systems/naval/comeSailAwayPeers.js
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Crowd-Wide.md"
related:
  - players-shown-crowd-count-overview
  - online-coop-peer-presence-and-crowd-fans
invariants:
  - "shows(id) is false only for ids the last cut removed by count (the gone set). Players filtered out before the cut stay true."
  - "`hcc.setPeerLook` and `csaPeers.setPeerLook` return `hidden` when `gateCrowd.shows(id)` is false, so no wagon, team, or boat appears without its rider."
  - "`crowdKinHidden` hides revenants, bands, and companions of a cut player (`crowdCutsPeer`), while keeping enemies marked `_pupMine`."
traps:
  - "Pick, plaque, page and social readers must filter through crowdDrawnHere (gateCrowd.shows && peerRange.shows)."
dfu: []
tags:
  - crowd
  - rendering
  - invisnet
---

# Crowd Count Cut-Player Hiding for Mounts, Boats, and Readers

Downstream rendering and UI readers (`src/net/gateCrowd.js`, `src/scenes/world.js`, `src/travel/horseCartWorld.js`, `src/characters/foesWorld.js`, `src/combat/combatVisuals.js`, and `src/systems/naval/comeSailAwayPeers.js`) suppress secondary visuals and interaction targets attached to count-culled peers.

- **Gone Set Membership:** In `src/net/gateCrowd.js`, `_crowdGone` holds the module-level set populated by the latest `createGateCrowd` cut. `shows(id)` returns `false` solely for player ids removed by that count limit; peers filtered out prior to the cut still return `true`.
- **Mounts, Boats, Lights, and Seats:** Both `hcc.setPeerLook` (`src/travel/horseCartWorld.js`) and `csaPeers.setPeerLook` (`src/systems/naval/comeSailAwayPeers.js`) return `hidden` whenever `gateCrowd.shows(id)` is `false`, ensuring no wagon, horse team, or boat renders without its rider. In `src/scenes/world.js`, `peerTorchLights` and `seatedPeerFeet` respect the cut list, whereas a card-table seat occupied by a cut peer continues to display as taken.
- **Summoned Kin and UI Readers:** In `src/characters/foesWorld.js` and `src/combat/combatVisuals.js`, `crowdKinHidden` hides revenants, mercenary bands, and companions owned by a cut peer (`crowdCutsPeer`), while preserving enemies flagged `_pupMine`. Pick, plaque, page, and social readers must filter candidates through `crowdDrawnHere` (`gateCrowd.shows && peerRange.shows`).
