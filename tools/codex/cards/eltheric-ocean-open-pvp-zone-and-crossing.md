---
slug: eltheric-ocean-open-pvp-zone-and-crossing
title: "Eltheric Open PvP Zone, Veilhaven Peace, and the Veil Crossing"
domain: multiplayer
kind: subcard
parent: eltheric-ocean-overview
files:
  - src/world/wild/etherWild.js
  - src/world/wildZone.js
  - src/systems/naval/etherCrossing.js
  - src/systems/naval/veilParty.js
  - src/world/ethericSea.js
routes: []
tables: []
replacesBible:
  - "03-World/Eltheric-Ocean.md"
related:
  - eltheric-ocean-overview
  - integrity-pvp-duel-and-wild-referees
  - naval-and-come-sail-away
  - world-modes-and-transitions
invariants:
  - "When online, every box pixel outside Veilhaven's peace is a Wrothgarian-law wild zone; `etherWildRingAt` maps the four depth bands to rings 1 to 4 with `WILD_RING_LOOT = [1.25, 1.5, 1.75, 2]`."
  - "`etherInPeace` covers the Veil, water within `ETHER_PEACE_PX` (`12`) pixels of Veilhaven, and the 12-pixel corridor running east from Veilhaven to the Veil."
  - "A death past the Veil respawns at the nearest port isle (`etherRisePort`), searching from `ETHER_RISE_PX` (`60`) and doubling outward before falling back to Veilhaven."
  - "A Veil crossing takes `CROSS_DAYS` (`3`) days, and party members follow within `VEIL_FOLLOW_MS` (`60_000`) ms if they remain within `VEIL_STAY_PX` (`1`) pixel."
traps:
  - "Teleports into, out of, or across the open sea are blocked (`ETHER_WILD_TEXT.teleport`), and `/unstuck` is refused outdoors on the ocean (`unstuckOut`)."
  - "Deaths to enemies drop no gear and deduct only the standard tenth of the gold purse; only a player kill drops carried items."
dfu: []
tags:
  - eltheric-ocean
  - wild-zone
  - pvp
  - veilhaven
  - veil-crossing
---

Open-sea PvP rules, Veilhaven sanctuary boundaries, respawn routing, and party Veil crossings live in `src/world/wild/etherWild.js`, `src/world/wildZone.js`, `src/systems/naval/etherCrossing.js`, and `src/systems/naval/veilParty.js`.

## Wild Rings and Veilhaven Peace

In online play, every pixel of `ETHER_BOX` outside Veilhaven's peace operates as a wild zone (without the movement speed caps used in mountain wild zones). `etherWildRingAt` maps the four depth bands to wild rings `1` through `4`, scaling loot multipliers through `WILD_RING_LOOT` (`[1.25, 1.5, 1.75, 2]`). In offline play, the ocean carries no PvP flag.

`etherInPeace` keeps combat disabled along the Veil, within `ETHER_PEACE_PX` (`12`) pixels of Veilhaven, and along the 12-pixel rows connecting Veilhaven east to the Veil. Open-sea teleports are rejected via `ETHER_WILD_TEXT.teleport`, and `/unstuck` is blocked outdoors on the water via `unstuckOut`.

## Respawn Routing and Veil Crossings

When a player dies outside the peace zone, `etherRisePort` searches outward from `ETHER_RISE_PX` (`60`) pixels, doubling the radius each step to locate the nearest port isle and falling back to Veilhaven. Deaths inside the peace always respawn at Veilhaven. Dying to enemies drops no inventory and takes only a tenth of the purse, whereas player kills drop carried items under wild-zone rules.

`src/systems/naval/etherCrossing.js` polls the helm every `CROSS_CHECK_S` (`0.5`) seconds. When the ship is at least `CROSS_LAND_PX` (`20`) pixels from land, a `CROSS_DAYS` (`3`) day transit bridges `HOME_WATERS` (`{ px: 180, py: 300 }`, `CROSS_X = 230`) and Veilhaven (`LANDFALL_OFF_PX = 4`). `src/systems/naval/veilParty.js` lets party members follow within `VEIL_FOLLOW_MS` (`60_000` ms) while holding within `VEIL_STAY_PX` (`1`) pixel.
