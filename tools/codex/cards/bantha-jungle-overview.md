---
slug: bantha-jungle-overview
title: "Bantha Jungle Biome: Area, Hosts, Switches, and Online Determinism"
domain: world
kind: overview
files:
  - src/world/jungle/banthaArea.js
  - src/world/jungle/jungleRegion.js
  - src/world/jungle/jungleModels.js
  - src/world/jungle/jungleTreesAssets.js
  - src/mods/lowPolyTreesAssets.js
  - src/world/jungle/jungleHost.js
  - src/world/treesHost.js
  - src/professions/treeHost.js
  - src/scenes/shared.js
  - src/net/nodeLaw.js
  - src/ai/cover.js
  - src/world/pixelBuild.js
replacesBible:
  - "03-World/Bantha-Jungle.md"
related:
  - bantha-jungle-area-field-and-layout
  - bantha-jungle-trails-and-roadside-pairs
  - bantha-jungle-floor-carpet
  - bantha-jungle-haze-and-culling
  - professions-gathering-nodes-and-motherlodes
  - sky-weather-and-lighting
invariants:
  - "Bantha is defined by the custom Hammerfell shoreline mask BANTHA_AREA_ROWS (run-length rows queried by pure banthaAreaHas(x, y)), not Daggerfall Unity political region 10."
  - "jungleOn forces the biome on for every online session regardless of visual skin; ?jungle=off is honored only offline, where the biome also requires the banthaJungle feature toggle on the enhanced skin."
  - "All vegetation placement uses deterministic integer hashes and ecotone value noise over world lattices so every client, floating-origin offset, and terrain worker builds identical jungles."
  - "treeSlots returns JUNGLE_TREE_SLOTS (48) for any pixel where banthaAreaHas is true and falls back to nodeCount(climate, 'tree') elsewhere; jungle timber nodes yield tier 1 PINE_WOOD."
  - "Failed tree asset fetches retry on BUILD_RETRY_MS intervals, and any roadside pair whose model fails to load falls back to regular canopy trees."
traps:
  - "Unlike ?jungle=off, the ?junglehaze=off query flag lacks an online-session guard in jungleHazeOn and disables atmospheric haze online as well."
  - "Wide jungle tree crowns (up to 15 meters) must register once in COVER_WIDE (32-meter) grid cells in src/ai/cover.js; indexing them across 4-meter cells explodes the proxy count for a pixel."
tags:
  - jungle
  - bantha
  - biome
  - world
  - trees
  - logging
---

# Bantha Jungle Biome: Area, Hosts, Switches, and Online Determinism

The Bantha jungle replaces the southwestern Hammerfell coast defined by the custom run-length shoreline mask `BANTHA_AREA_ROWS` (`banthaAreaHas(x, y)` in `src/world/jungle/banthaArea.js`) rather than political region 10. Placement flows from the mask through the signed-distance field (`src/world/jungle/jungleRegion.js`) and terrain worker layout into four runtime hosts: canopy trees (`src/world/treesHost.js` and `src/professions/treeHost.js`), atmospheric mist (`src/world/jungle/jungleHost.js`), ground flora (`src/world/jungle/jungleFloorHost.js`), and liana arches (`src/systems/livingWorld/roadsidePairs.js`).

## Switches, Tree Models, Cover, and Logging

- **Online determinism (`src/scenes/shared.js`):** `jungleOn` enables the biome unconditionally on online pages so collision, cover, and harvesting match for all peers. Offline sessions honor `?jungle=off` and require the `banthaJungle` feature flag on the enhanced skin. `?junglehaze=off` (`jungleHazeOn`) clears the mist without an online guard.
- **Models and retries (`src/world/jungle/jungleModels.js`):** Five custom tree species load from OBJ/MTL meshes (`JUNGLE_ARCHIVE` `500`, `JUNGLE_SPECIES`, `JUNGLE_MEASURES`, and `TRUNK_BAND` `3`) through `createLowPolyTrees` (`src/mods/lowPolyTreesAssets.js` and `src/world/jungle/jungleTreesAssets.js`) with `JUNGLE_SUN_LIFT` `0.6` (`uSunLift`), retrying failed fetches on `BUILD_RETRY_MS` (`[2000, 4000, 8000, 16000, 32000]`).
- **AI cover and timber (`src/ai/cover.js`, `src/net/nodeLaw.js`):** `jungleCover` assigns each tree a trunk cylinder and a crown sphere (radius scaled by `JUNGLE_CROWN_COVER` `0.7`) stored in `COVER_WIDE` (`32` m) cells and streamed by `src/world/pixelBuild.js` in `COVER_SLICE` (`2048`) chunks. Bantha pixels expose `JUNGLE_TREE_SLOTS` (`48`) tier 1 `PINE_WOOD` nodes marked outside the trunk by `jungleTreeMark`.
