---
slug: "world-arc-classic-port-overview"
title: "World Arc: Terrain, Nature, Locations, Dungeons, and Interiors"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/world/terrainSampler.js"
  - "src/world/terrainTiles.js"
  - "src/world/terrainNature.js"
  - "src/formats/umRandom.js"
  - "src/world/perlin.js"
  - "src/formats/woodsFile.js"
  - "src/world/dungeonLayout.js"
  - "src/world/interiorLayout.js"
  - "src/world/staticBuildings.js"
  - "src/world/texRemap.js"
  - "src/world/cityGate.js"
  - "src/world/regionConditions.js"
  - "src/world/regionHubs.js"
  - "src/world/terrainSurface.js"
routes: []
tables: []
replacesBible:
  - "03-World/World-Arc.md"
related:
  - "pixel-streaming-and-origin-shift"
  - "world-modes-and-transitions"
  - "world-arc-towns-talk-and-crime"
  - "world-arc-windmills-and-rotor"
  - "world-arc-record-gates-and-dungeon-entry"
  - "landforms-terrain-shaper-overview"
  - "roads-network-overview"
invariants:
  - "Terrain samples clamp01(h / MAX_TERRAIN_HEIGHT) with MAX_TERRAIN_HEIGHT = 1539 over an ocean floor of float32 27.2."
  - "Nature scatter skips tiles steeper than MAX_STEEPNESS = 50 degrees and anything inside the location rect widened by NATURE_CLEARANCE = 4, seeded deterministically from makeTerrainKey(mapPixelX, mapPixelY)."
  - "UMRandom is a verbatim Unity.Mathematics.Random: CreateFromIndex seeds wangHash(index + 62) and steps xorshift 13/17/5."
  - "All four hosts (exterior, world, interiorContext, dungeonContext) route climate/dungeon texture swaps through remapSubMeshes in src/world/texRemap.js."
  - "StaticBuilding boxes are DFMesh.Size * GLOBAL_SCALE, the same units as mesh vertices."
  - "`pickRegionHubs` counts only base MAPS.BSA locations (`isBase`), so world-data mod additions never change a region's hub and clients with asset injection on or off agree."
  - "`staticBuildingsHasHit` returns the first building in array order whose box contains the point, as DFU breaks on the first match. Reordering the buildings changes which one is returned."
  - "`reskinRemap` builds a new remap table and never writes into the current one, because the renderer caches draws by table identity; a half-written table would draw half a season."
traps:
  - "Terrain tile lookup bytes encode records 0-55 with rotate +64 and flip +128; RMB ground tiles read GroundTiles[x][15 - y] and records >= 56 reset to grass."
  - "Online, updateCityGate holds every gate on CITY_GATE_OPEN_MODEL_ID (446) regardless of night; only offline does the classic isNight toggle to 447 run."
  - "Dungeon layout runs removeOverlappingDoors (verbatim DaggerfallDungeon.RemoveOverlappingDoors) in dungeonLayout.js, not rdbLayout.js."
  - "`VALUES_WIDTH` and `FLAGS_WIDTH` are 29, `FLAGS2_WIDTH` is 14, and the value min/max tables have 26 entries, copying DFU. Do not equalize them to the 30-member flag enum."
  - "Water classification compares float32 heights against float32 thresholds, as DFU does; comparing a double product against a double constant fails for every clamped sea sample and draws open ocean as dirt."
  - "`playerTileMapIndex` is the converted tile byte shifted right two, so the location-zero sentinel reads as record 0, which is water; a town ground tile encoding as zero reads as water, as in DFU. Off-terrain is -1."
dfu:
  - "Assets/Scripts/Terrain/DefaultTerrainSampler.cs"
  - "Assets/Scripts/Terrain/TerrainNature.cs"
  - "Assets/Scripts/Terrain/TerrainTexturing.cs"
  - "Assets/Scripts/API/WoodsFile.cs"
  - "Assets/Scripts/Internal/DaggerfallDungeon.cs"
  - "Assets/Scripts/Internal/DaggerfallInterior.cs"
  - "Assets/Scripts/Internal/DaggerfallStaticBuildings.cs"
  - "Assets/Scripts/Internal/DaggerfallCityGate.cs"
tags:
  - "terrain"
  - "nature"
  - "dungeons"
  - "interiors"
  - "city-gate"
  - "texture-remap"
---

# World Arc: Terrain, Nature, Locations, Dungeons, and Interiors

Classic world port modules handle terrain sampling, tile lookup, deterministic nature scatter, dungeon and interior layouts, static building bounds, texture remapping, and city gates at `GLOBAL_SCALE = 0.025` (`4096` RMB units equal `102.4`, `2048` RDB units equal `51.2`).

- **Terrain and nature (`src/world/terrainSampler.js`, `src/world/terrainTiles.js`, `src/world/terrainNature.js`, `src/formats/umRandom.js`, `src/world/perlin.js`, `src/formats/woodsFile.js`):** Terrain samples `clamp01(h / MAX_TERRAIN_HEIGHT)` (`MAX_TERRAIN_HEIGHT = 1539`) over a float32 `27.2` ocean floor. Tile lookup bytes encode records `0-55` with rotate `+64` and flip `+128`, while RMB ground tiles read `GroundTiles[x][15 - y]` and reset records `>= 56` to grass. Nature scatter seeds from `makeTerrainKey(mapPixelX, mapPixelY)` via `UMRandom` (`CreateFromIndex` seeds `wangHash(index + 62)` and steps xorshift `13/17/5`), skipping slopes over `MAX_STEEPNESS = 50` degrees and location rects widened by `NATURE_CLEARANCE = 4`.
- **Dungeons, interiors, buildings, and gates (`src/world/dungeonLayout.js`, `src/world/interiorLayout.js`, `src/world/staticBuildings.js`, `src/world/texRemap.js`, `src/world/cityGate.js`):** `dungeonLayout.js` runs `removeOverlappingDoors`. `interiorLayout.js` positions `FLOOR_MODEL_TYPE = 5` tower floors on their lowest vertex and filters `27` misplaced model `31000` combinations. `StaticBuilding` boxes equal `DFMesh.Size * GLOBAL_SCALE`, all four hosts swap textures through `remapSubMeshes`, and `updateCityGate` holds `CITY_GATE_OPEN_MODEL_ID` (`446`) online while toggling to `CITY_GATE_CLOSED_MODEL_ID` (`447`) at night offline.
