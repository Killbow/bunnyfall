---
slug: "come-sail-away-placement-packing-and-cabins"
title: "Boat Placement, Lost Boats, Packing, and Sailing Cabins"
domain: "world"
kind: "subcard"
parent: "come-sail-away-overview"
files:
  - "src/systems/naval/comeSailAway.js"
  - "src/systems/naval/comeSailAwayHulls.js"
  - "src/systems/naval/comeSailAwayItems.js"
  - "src/systems/naval/sailingCabin.js"
  - "src/systems/naval/sailingCabinAccess.js"
  - "src/systems/naval/boatCabinOwnership.js"
  - "src/systems/naval/warmAshesShips.js"
  - "src/systems/naval/fleet.js"
  - "src/net/boatIdentity.js"
  - "src/world/prefabColliders.js"
  - "src/scenes/worldModes.js"
routes: []
tables: []
replacesBible:
  - "03-World/Come-Sail-Away.md"
related:
  - "come-sail-away-overview"
  - "holdings-fleet-ledger-titles-and-refits"
  - "world-modes-and-transitions"
invariants:
  - "`PLACE_RAY_DISTANCE` = 100; `WATER_LEVEL` = 34 (100 when World of Daggerfall terrain is present)."
  - "LOST-BOAT: an uncrewed boat more than `LOST_UNDER_M` (2) below ground or sea top is packed into parts once."
  - "`recoverLostBoats` judges only boats within `2 * TERRAIN_EDGE` of the player's terrain tile, and packs one only after the lost reading has held for `LOST_CONFIRM_S` (5) seconds of game time."
  - "`cabinShipType`: hull 2 maps to the small bank ship, hulls 3 and 4 to the large one; `WA_SHIP_BLOCKS` = ['SHIPAA00.RMB', 'SHIPAA01.RMB']; Rowboat and Large Boat have no cabin."
  - "`cabinSceneName(uid)` returns `SailingCabin [UID=<uid>]`; `hasSailingCabin` excludes chartered boats and boats already inside."
traps:
  - "`cabinEntryRefusal` must refuse when `hostile` is true: every interior transition empties the sea, so entering a cabin would despawn pirates."
  - "`linkBankCabin` moves the bank ship room without prompting; whether to prompt is an open owner decision."
dfu:
  - "Assets/Scripts/Game/PlayerEnterExit.cs"
tags:
  - "come-sail-away"
  - "placement"
  - "cabins"
  - "packing"
---

# Boat Placement, Lost Boats, Packing, and Sailing Cabins

Water placement raycasts, lost-boat recovery, hull packing, and interior sailing cabins are managed across `src/systems/naval/comeSailAway.js`, `src/systems/naval/comeSailAwayHulls.js`, `src/systems/naval/comeSailAwayItems.js`, `src/systems/naval/sailingCabin.js`, `src/systems/naval/sailingCabinAccess.js`, `src/systems/naval/boatCabinOwnership.js`, and `src/scenes/worldModes.js`.

- **Placement, origin shifts, and packing:** Water placement casts up to `PLACE_RAY_DISTANCE` (`100`) across deep-water slabs, dungeon water planes, terrain water tiles, and the `WATER_LEVEL` plane (`34`, or `100` with World of Daggerfall terrain), aborting when no water surface is hit, and builds colliders via `src/world/prefabColliders.js`. `OnWorldReanchored(offset)` shifts active boats during floating-origin moves, while `Compatibility.PersistentDungeonBoats` (default `true`) retains indoor boats. Under `LOST-BOAT`, any uncrewed vessel sitting more than `LOST_UNDER_M` (`2` m) below ground or the sea surface is packed into parts once. `SHIP-PACK` packs any hull at `packedHullWeight` while preserving vessel UID (`src/net/boatIdentity.js`) and value, and deeds live in the Fleet book (`src/systems/naval/fleet.js`).
- **Sailing cabins and combat gates:** `cabinShipType` maps hull `2` to the small bank ship and hulls `3` and `4` to the large bank ship (`WA_SHIP_BLOCKS = ['SHIPAA00.RMB', 'SHIPAA01.RMB']` in `src/systems/naval/warmAshesShips.js`), leaving Rowboat and Large Boat without cabins. `cabinSceneName(uid)` formats `SailingCabin [UID=<uid>]`, `hasSailingCabin` excludes chartered or already-interior vessels, `linkBankCabin` relocates the bank ship room without prompting, and `cabinEntryRefusal` blocks entry whenever `hostile` is true so interior transitions cannot despawn sea attackers.
