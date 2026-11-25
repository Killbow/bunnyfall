---
slug: horse-coats-overview
title: "Horse Coats: Look Fields, Birth, Restyle, and Wire Code"
domain: world
kind: overview
parent: null
files:
  - src/travel/horseCoats.js
  - src/items/inventorySession.js
  - src/ui/holdingsPages.js
  - src/scenes/exterior.js
  - src/travel/horseCartWorld.js
  - src/net/wire.js
  - src/travel/horseCartWire.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Horse-Coats.md"
related:
  - horse-coats-sprite-dye-and-hide-mask
  - horse-coats-3d-courser-and-saddle
  - holdings-stable-and-transport-stabling
  - horse-teams-pose-cadence-and-dye-budget
invariants:
  - "A look is four item fields: horseCoat, horsePattern, horseLegs, horseSeed (1..HORSE_SEED_MAX = 65535)."
  - "horseLookCode = coat + 7 * (pattern + 5 * (legs + 3 * seed)); HORSE_LOOK_CODE_MAX = 6881279; code 0 is the untinted bay."
  - "restyleRiddenHorse changes coat, pattern, legs only; horseSeed never changes."
  - "BIRTH_WEIGHTS: coat [5,4,2,2,1,1,1], pattern [6,2,1,2,1], legs [5,3,2]."
traps:
  - "The ridden horse is the first Transport Horse in the pack (activeHorseItem, mirroring inventorySession.js hasHorse), not a chosen one."
  - "Wire fields hc (parked wagon) and rc (rider pose) are only accepted in 1..HORSE_LOOK_MAX; anything else reads as bay."
  - "Do not hardcode RELAY_VERSION when reasoning about the look wire."
dfu: []
tags:
  - horses
  - coats
  - stable
  - wire
  - birth
---

# Horse Coats: Look Fields, Birth, Restyle, and Wire Code

Horse appearances in `src/travel/horseCoats.js` combine seven base coats (`bay`, `chestnut`, `black`, `gray`, `dun`, `buckskin`, and `palomino`), five patterns (`solid`, `pinto`, `appaloosa`, `dapples`, and `roan`), and three leg markings (`plain`, `socks`, and `stockings`) with a deterministic seed.

## Item Look Fields, Birth Weights, and Restyling

- **Four item fields:** Each horse item stores `horseCoat`, `horsePattern`, `horseLegs`, and `horseSeed` (`1..HORSE_SEED_MAX = 65535`). `shadeOf(seed)` jitters hue up to `SHADE_HUE = 4` degrees and value up to `SHADE_VALUE = 0.075`.
- **Birth and restyle:** Unseeded pack horses receive looks via `birthHorses` using `BIRTH_WEIGHTS` (coat `[5,4,2,2,1,1,1]`, pattern `[6,2,1,2,1]`, and legs `[5,3,2]`), called from `src/scenes/exterior.js`, `hccTick` in `src/travel/horseCartWorld.js`, and `stableProviderFor` in `src/ui/holdingsPages.js`. The ridden mount is always the first Transport Horse in the pack (`activeHorseItem`, matching `hasHorse` in `src/items/inventorySession.js`). `restyleRiddenHorse` updates `horseCoat`, `horsePattern`, and `horseLegs` while keeping `horseSeed` intact.

## Wire Encoding and Stranger Seeds

`horseLookCode` packs an appearance as `coat + 7 * (pattern + 5 * (legs + 3 * seed))` up to `HORSE_LOOK_CODE_MAX = 6881279`, where code `0` represents the untinted bay. Wire fields `hc` (parked wagon in `src/travel/horseCartWire.js`) and `rc` (rider pose in `src/net/wire.js`) accept codes in `1..HORSE_LOOK_MAX` and fall back to bay otherwise, without hardcoding `RELAY_VERSION`. For ambient horses, `strangerHorseLook(key)` hashes `BIRTH_WEIGHTS` onto `STRANGER_SEEDS = 16` shared seeds.
