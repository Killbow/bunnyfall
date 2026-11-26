---
slug: caverns-mines-overview
title: "Caverns: Shared Mines, Stability, Shoring and the Collapse"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/mine/mineSites.js
  - src/net/mine/mineLayout.js
  - src/net/mine/mineVeins.js
  - src/net/mine/mineBrain.js
  - src/net/mine/mineWire.js
  - src/world/mine/mineModel.js
  - src/world/mine/mineSurfaces.js
  - src/world/mine/mineLocation.js
  - src/world/mine/mineArt.js
  - src/systems/mine/mineHost.js
  - src/systems/mine/mineClient.js
  - src/systems/mine/mineMouths.js
  - src/ui/mineMapMark.js
  - src/ui/mineDrillReadout.js
  - src/travel/travelViewMarks.js
  - server/src/world/mine.js
  - src/net/mine/mineDrill.js
  - src/net/mine/mineReceipt.js
  - server-account/src/mineHaul.js
  - tools/mineArtBake.mjs
routes:
  - /v1/mine/haul
tables:
  - mine_hauls
related:
  - professions-gathering-nodes-and-motherlodes
invariants:
  - "A mine is one relay room (`dungeon:m<mapId>`) over the `mn` frame; `MINE_RELAY_MIN` (278) gates the client."
  - "Cave veins (`cvein:`) are server-checked harvests with no ground test, capped at `MINE_VEINS_PER_DAY` (150)."
  - "A collapse seals the mine for `MINE_SEAL_S` (3600 s) and the next opening bumps its `reset`, which reshuffles the layout."
traps:
  - "The player's `pos` is the feet: the start marker sits 0.3 m over the mouth tunnel's floor, never 1.75 m up."
  - "Billboard batch centres are the base; never add half the height."
  - "Walking into a mouth runs from onlineWorld's frame alone; offline probes call `window.__mine()`."
tags:
  - caverns
  - mining
  - shoring
---

Mouths stand in the wilds on pixels `mineAt` rolls (`MINE_CHANCE` by climate, never on a location). With `public/art/bunnyfall-mine/` readable, the owner's entrance model stands there (collider bucket `mine:mouth:<px,py>`); otherwise Daggerfall's flats do. The world maps mark eligible mine entrances before discovery. The parchment V map draws orange dots at close zoom, with a saved Mines toggle in the map key. Overworld Travel shows nearby entrances as orange mining markers under the Gathering filter.

Inside, `mineLayout(mineId, reset)` builds sections of domed chambers joined by tubes, made into one virtual RDB block (`MINE_LOCATION_ID`). Tube walls are trimmed where they enter a chamber, with a short overlap at the portal. Holes name their ore and seam. Walls are sound or weak.

The relay's `MinePart` runs `stepMine`: each answered strike wears its section's stability (`MINE_COST`, weak walls 1.5x), shoring spends a Stores plank whose wood sets the gain (`MINE_WOOD_STRENGTH`), and falling stability says dust, creak, rumble, then collapse. A collapse shakes, fades and puts everyone out with what they carry. Strikes fill a section's alarm (`MINE_ALARM`): each fill calls `wave:s:c:n`, and the relay's minute tick may send `stray:s:c:n` (`MINE_STRAY`); the room's host stands them through `spawnFoeNear` (`src/systems/mine/mineFoes.js`). A drill (`src/net/mine/mineDrill.js`, `MINE_DRILL`) set on a hole runs a shift, filling a hopper only its setter empties; the relay signs each haul (`mineReceipt.js`, `m1.`) and `/v1/mine/haul` pays it once (`mine_hauls`, migration 0221). Drill work depletes each ore deposit for the current mine reset. The deposit disappears, and its hopper remains available until emptied. The ore icon and live hopper count appear above nearby drills. Unshored weak walls amplify drill wear, just as they do pick strikes. A drill names its setter's party as `crew` (they may empty it) and stops when its setter leaves (the tick's `here`); `lamp` lights a chamber against strays.
