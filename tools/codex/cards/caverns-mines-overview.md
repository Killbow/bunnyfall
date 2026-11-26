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
  - src/net/mine/mineHaulLaw.js
  - src/net/mine/mineRegions.js
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

Mouths stand in the wilds on pixels `mineAt` rolls (`MINE_CHANCE` by climate, never on a location), drawn with the owner's entrance model when `public/art/bunnyfall-mine/` is readable. The V map shows orange dots at close zoom (a saved Mines toggle); Travel shows nearby entrances under the Gathering filter.

Inside, `mineLayout(mineId, reset)` builds sections of domed chambers joined by tubes, as one virtual RDB block (`MINE_LOCATION_ID`). Holes name their ore and seam; walls are sound or weak. A mine in a signature region (`mineRegions.js`, built by `tools/mineRegionsBuild.mjs` from MAPS.BSA, since the relay has none) holds that ore in a third of its holes past the shallows.

The relay's `MinePart` runs `stepMine`: each strike wears its section's stability (`MINE_COST`, weak walls 1.5x), a Stores plank shores it (`MINE_WOOD_STRENGTH`), and falling stability says dust, creak, rumble, then collapse, which puts everyone out. Strikes fill an alarm (`MINE_ALARM`) that calls `wave:s:c:n`, and the minute tick may send `stray` (`MINE_STRAY`) via `spawnFoeNear`. A drill (`MINE_DRILL`) runs a shift into a hopper its setter or crew empties; the relay signs each haul (`mineReceipt.js`) and `/v1/mine/haul` pays it once. A deposit holds 15 runs of `drillYield(rich)` ore (2, 3 or 5; `mineOreLeft`), as an examined hole says, then depletes for the reset. A paid haul takes the character's Firmament mining yield and half a node's mining XP per ore (`mineHaulLaw.js`); a Surveyor is told the mine's ores on entry. Unshored weak walls amplify drill wear. The drill stops when its setter leaves; `lamp` keeps strays from a chamber.
