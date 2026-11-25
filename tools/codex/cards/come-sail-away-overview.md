---
slug: "come-sail-away-overview"
title: "Come Sail Away Port: Boats, Hulls, Items, and Settings"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/systems/naval/comeSailAway.js"
  - "src/systems/naval/comeSailAwayBoat.js"
  - "src/systems/naval/comeSailAwayHulls.js"
  - "src/systems/naval/comeSailAwayItems.js"
  - "src/systems/naval/comeSailAwayModels.js"
  - "src/systems/naval/csaBoatMenu.js"
  - "src/render/comeSailAwayRender.js"
  - "src/world/prefabNode.js"
  - "src/world/skinnedBake.js"
  - "src/world/unityAnimator.js"
  - "src/world/galleonArt.js"
  - "src/world/carrackArt.js"
  - "src/world/largeBoatArt.js"
  - "src/mods/modSettings.js"
  - "src/trade/shopStock.js"
  - "src/ui/boatMarks.js"
  - "src/systems/naval/farLife.js"
  - "tools/comeSailAwayExtract.mjs"
routes: []
tables: []
replacesBible:
  - "03-World/Come-Sail-Away.md"
related:
  - "naval-and-come-sail-away"
  - "come-sail-away-helm-and-sail-handling"
  - "come-sail-away-placement-packing-and-cabins"
  - "come-sail-away-online-peer-boats-and-aboard"
  - "ship-livery-flags-and-plaques"
  - "holdings-fleet-ledger-titles-and-refits"
  - "shipyards-shipmaster-sales-and-resale"
  - "peer-range-and-distant-ship-hulls"
invariants:
  - "Hull prefab id is `FIRST_HULL_MODEL_ID` (112410) + hull index 0..4 (Rowboat, Large Boat, Small Ship, Large Galley, Carrack); trigger prefabs are `TRIGGER_MODEL` 112400..112406 (drive, board, cargo, door, variant, status, position)."
  - "Boat items are `BOAT_PARTS_TEMPLATE` (1320) and `BOAT_DEED_TEMPLATE` (1321); Shipyards, not general stores, trade them (`src/trade/shopStock.js`)."
  - "`packedHullWeight(hull)` = min(`HULL_WEIGHTS[hull]`, `PACKED_WEIGHT_MAX`), where `PACKED_WEIGHT_MAX` = `HULL_WEIGHTS[1]` (120 kg)."
traps:
  - "Three declared settings (`Handling.BadTack`, `Handling.BadTackMultiplier`, `SailingAssist.AutoStowGaffSails`) are intentionally unread; do not wire them."
  - "Ship art pseudo-archives (`GALLEON_ARCHIVE` 38131, `CARRACK_ARCHIVE` 38141, `LARGE_BOAT_ARCHIVE` 38171) must not collide with other pseudo-archives; 38151 belongs to the Shattered Hour realm."
dfu: []
tags:
  - "come-sail-away"
  - "naval"
  - "boats"
  - "mods"
  - "items"
---

# Come Sail Away Port: Boats, Hulls, Items, and Settings

The Come Sail Away port (`src/systems/naval/comeSailAway.js`, `src/systems/naval/comeSailAwayBoat.js`, and `src/render/comeSailAwayRender.js`, extracted via `tools/comeSailAwayExtract.mjs`) implements real-time sailing across slices `CSA-A..CSA-L` and port extensions (`HELM-WAY`, `SAIL-FREE`, `SHIP-PACK`, `BOAT-MENU` in `src/systems/naval/csaBoatMenu.js`, `BOAT-MARK`, `GALLEON`, `SHIPS-2`, and `SEA-TOWN`).

- **Hulls, prefabs, and custom art:** Hull prefab IDs equal `FIRST_HULL_MODEL_ID` (`112410`) plus hull index `0..4` (Rowboat, Large Boat, Small Ship, Large Galley, and Carrack in `src/systems/naval/comeSailAwayHulls.js` and `src/systems/naval/comeSailAwayModels.js`). Trigger prefabs span `TRIGGER_MODEL` `112400..112406` (drive, board, cargo, door, variant, status, and position) with `BED_MODEL_ID` (`41000`) and trigger reach `ACTIVATION_DISTANCE` (`3.2`). Boats build `src/world/prefabNode.js` trees with `src/world/skinnedBake.js` and `src/world/unityAnimator.js`. Small Ship, Large Boat, and Carrack use custom models (`64x64` `GALLEON_TEX_SIZE` liveries in `src/world/galleonArt.js`, `src/world/carrackArt.js`, and `src/world/largeBoatArt.js`) under pseudo-archives `GALLEON_ARCHIVE` (`38131`), `CARRACK_ARCHIVE` (`38141`), and `LARGE_BOAT_ARCHIVE` (`38171`, avoiding `38151`).
- **Items, marks, cadence, and settings:** `src/systems/naval/comeSailAwayItems.js` defines `BOAT_PARTS_TEMPLATE` (`1320`) and `BOAT_DEED_TEMPLATE` (`1321`, traded at Shipyards per `src/trade/shopStock.js`), with `packedHullWeight(hull)` capped at `PACKED_WEIGHT_MAX` (`HULL_WEIGHTS[1] = 120` kg). `src/ui/boatMarks.js` draws `BOAT_MARK_CSS` (`#20e0b0`) compass marks past `BOAT_MARK_NEAR_M` (`12` m, `BOAT_PIXEL_SLACK_M = 120` m), `src/systems/naval/farLife.js` steps rigging past `NEAR_LIFE_M` (`600` m) every `FAR_LIFE_EVERY` (`4`) frames, `src/mods/modSettings.js` leaves `Handling.BadTack`, `Handling.BadTackMultiplier`, and `SailingAssist.AutoStowGaffSails` unread, and console commands `giveboat`, `placeboat`, `printboats`, `identifyboat`, and `purgeboat` register in `src/scenes/world.js`.
