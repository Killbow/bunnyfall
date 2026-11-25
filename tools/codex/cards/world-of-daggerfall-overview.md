---
slug: "world-of-daggerfall-overview"
title: "World of Daggerfall: Wilderness Sites Ported 1:1"
domain: "world"
kind: "overview"
parent: null
files:
  - "src/world/worldOfDaggerfall.js"
  - "src/world/wodLocationPack.js"
  - "src/world/wodLocationData.js"
  - "src/world/wodLocationLoader.js"
  - "src/world/pixelBuild.js"
  - "src/world/terrainSampler.js"
  - "src/scenes/world.js"
  - "tools/worldOfDaggerfallAssets.mjs"
routes: []
tables: []
replacesBible:
  - "03-World/World-Of-Daggerfall.md"
related:
  - "world-of-daggerfall-loader-flatten-and-clearances"
  - "world-of-daggerfall-camp-markers-and-shared-spawns"
  - "house-nature-flats-boulder-uvs-and-wod-sea-region"
  - "pixel-streaming-and-origin-shift"
invariants:
  - "Region packs (`WOD_PACK_MAGIC = 'WODL'`, `WOD_PACK_VERSION = 1`) are fetched by `fetchPackBytes` with a `WOD_PACK_STALL_MS` (15000) stall and `WOD_PACK_ATTEMPTS` (3) attempts."
  - "A region whose pack fails is retried up to `WOD_RETRY_MAX` (12) times with delay `min(60000, 5000 * 2 ** tries)`."
  - "Offline, region 17 (`WOD_AWAKE_REGION`) loads at open and others on entry; online, every folder loads at once, 17 first then ascending, so all peers flatten identically."
  - "Global terrain height scale is `STREAMING_TERRAIN_SCALE = 1.25`, overriding the prefab `DEFAULT_TERRAIN_SCALE = 1.5`; legacy saves are rescaled in `src/world/worldSaveLoad.js`."
traps:
  - "Pixels named by a region that lands late are destroyed and rebuilt via `destroyPixel` so list order stays the law; never patch them in place."
  - "Do not compute site heights with 1.5; the height factor is `MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE` (1923.75)."
dfu: []
tags:
  - "world-of-daggerfall"
  - "wod"
  - "terrain"
  - "region-packs"
---

# World of Daggerfall: Wilderness Sites Ported 1:1

World of Daggerfall (`WOD_VENDOR = 'world-of-daggerfall'`) ports wilderness bandit camps, guard outposts, and giant rock layouts (`WOD_MOUNTAIN_PREFAB = /^WOD_Mountain_/`) across `src/world/worldOfDaggerfall.js`, `src/world/wodLocationPack.js`, `src/world/wodLocationData.js`, and `src/world/wodLocationLoader.js`.

- **Region packs, retries, and load order (`src/world/worldOfDaggerfall.js`, `src/world/wodLocationPack.js`, `tools/worldOfDaggerfallAssets.mjs`):** Binary region packs (`WOD_PACK_MAGIC = 'WODL'`, `WOD_PACK_VERSION = 1`) download through `fetchPackBytes` with a `WOD_PACK_STALL_MS` (`15000`) timeout across `WOD_PACK_ATTEMPTS` (`3`) tries. Failed regions retry up to `WOD_RETRY_MAX` (`12`) times using `min(60000, 5000 * 2 ** tries)` backoff, while `WOD_REFUSED_REGION` (`31`) never loads. Offline sessions load region `17` (`WOD_AWAKE_REGION`) at boot and fetch remaining regions on entry; online sessions load every folder at once (`17` first, then ascending) so all peers flatten terrain identically. When a region pack arrives after its pixels have already built, the host tears down and rebuilds affected tiles via `destroyPixel` rather than patching them in place, preserving strict list order.
- **Terrain height scale (`src/world/terrainSampler.js`, `src/world/pixelBuild.js`, `src/scenes/world.js`):** Overworld elevation uses `STREAMING_TERRAIN_SCALE = 1.25` instead of the prefab `DEFAULT_TERRAIN_SCALE = 1.5`. Site heights multiply by `MAX_TERRAIN_HEIGHT * STREAMING_TERRAIN_SCALE` (`1923.75`), and legacy saves rescale in `src/world/worldSaveLoad.js`.
