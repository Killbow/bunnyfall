---
slug: eltheric-ocean-overview
title: "The Eltheric Ocean: Box, Veil, and Depth Bands"
domain: world
kind: overview
parent: null
files:
  - src/world/ethericSea.js
  - src/world/etherPlaces.js
  - src/world/etherWatersBake.js
  - src/world/wild/etherWild.js
  - src/systems/naval/etherShips.js
  - src/systems/naval/etherCrossing.js
  - src/systems/naval/sea/seaEvents.js
  - src/systems/naval/sea/seaVaults.js
routes: []
tables: []
replacesBible:
  - "03-World/Eltheric-Ocean.md"
related:
  - eltheric-ocean-isles-places-and-depth-bake
  - eltheric-ocean-open-pvp-zone-and-crossing
  - eltheric-ocean-legends-vaults-and-sea-events
  - eltheric-ocean-ship-pvp-wrecks-bounties-and-season
  - naval-and-come-sail-away
  - pixel-streaming-and-origin-shift
invariants:
  - "`ETHER_BOX` is `{ x0: 64, x1: 8128, y0: -7680, y1: -2688 }` in map pixels; `inEtherLaw` returns open sea for `ETHER_MARGIN` (`64`) pixels around it."
  - "The Veil spans the easternmost `VEIL_PX` (`16`) pixels of the box (`VEIL_X = ETHER_BOX.x1 - VEIL_PX`)."
  - "Depth measures leagues west of the Veil (`etherDepthAt`, `LEAGUE_M = 4828`); `BANDS` begin at 0 (Shallows), 12 (Reaches), 45 (Deep Aether), and 140 (Abyss) leagues."
  - "Every player-facing name comes from `ETHER_WORD` (`'Eltheric'`) via `ETHER_SEA_NAME` and `ETHER_SEA_TITLE`."
traps:
  - "Never hardcode legacy sea-name strings; all text must read `ETHER_WORD`, `ETHER_SEA_NAME`, and `ETHER_SEA_TITLE`."
  - "`onBayOrEther` is the ground check for profession nodes and Overworld bands. Checking only the Iliac Bay map bounds hides them past the Veil."
dfu: []
tags:
  - eltheric-ocean
  - ether
  - veil
  - depth-bands
  - world
---

The Eltheric Ocean is a procedural open-sea realm defined across `src/world/ethericSea.js`, `src/world/etherPlaces.js`, `src/world/etherWatersBake.js`, `src/world/wild/etherWild.js`, `src/systems/naval/etherShips.js`, and `src/systems/sea/`. Every player-facing label reads `ETHER_WORD` (`'Eltheric'`) through `ETHER_SEA_NAME` and `ETHER_SEA_TITLE`.

## Map Box and the Veil

`ETHER_BOX` covers `{ x0: 64, x1: 8128, y0: -7680, y1: -2688 }` in map pixels, and `inEtherLaw` includes an outer margin of `ETHER_MARGIN` (`64`) pixels. The Veil occupies the easternmost `VEIL_PX` (`16`) pixels (`VEIL_X = ETHER_BOX.x1 - VEIL_PX`). Because ocean pixels lie outside standard Iliac Bay bounds, Overworld bands and profession gathering nodes must check `onBayOrEther` rather than Bay coordinates alone.

## Depth Bands and Naval Scaling

`etherDepthAt` measures distance west of the Veil in leagues (`LEAGUE_M = 4828`). Because `etherBandAt(x)` depends only on the `x` coordinate, the four entries in `BANDS` form vertical strips moving west from the Veil:

- **Shallows (`0` leagues):** ship level offset `+1`, hold rarity tier `1`, and pirate weight `1`.
- **Reaches (`12` leagues):** ship level offset `+3`, hold rarity tier `2`, and pirate weight `1.6`.
- **Deep Aether (`45` leagues):** ship level offset `+6`, hold rarity tier `3`, and pirate weight `2.4`.
- **Abyss (`140` leagues):** ship level offset `+9`, hold rarity tier `4`, and pirate weight `3.4`.

## Subcards

- `eltheric-ocean-isles-places-and-depth-bake`: procedural isles, place records, and lazy seabed baking.
- `eltheric-ocean-open-pvp-zone-and-crossing`: wild-zone rings, Veilhaven peace, and Veil crossings.
- `eltheric-ocean-legends-vaults-and-sea-events`: legendary ships, daily deep vaults, aether storms, and treasure fleets.
- `eltheric-ocean-ship-pvp-wrecks-bounties-and-season`: ship refereeing, wreck prizes, bounties, and season boards.
