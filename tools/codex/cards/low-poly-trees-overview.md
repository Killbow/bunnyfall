---
slug: low-poly-trees-overview
title: "Low Poly Trees: 3D Trees Near, Far Pictures Beyond, Flats Untouched"
domain: rendering
kind: overview
parent: null
files:
  - src/world/lowPolyTrees.js
  - src/mods/lowPolyTreesAssets.js
  - src/world/treesHost.js
  - src/render/lowPolyTreesRender.js
  - src/render/lowPolyTreesGlsl.js
  - src/render/renderer.js
  - src/world/lptCrowns.js
  - src/world/roadVerge.js
  - src/world/pixelBuild.js
  - src/scenes/world.js
  - src/scenes/exterior.js
  - src/homes/yardNature.js
  - src/homes/homeYards.js
  - vendor/low-poly-trees/lowpolytrees.dfmod.json
routes: []
tables: []
replacesBible:
  - "07-Rendering/Low-Poly-Trees.md"
related:
  - low-poly-trees-atlas-painting-and-seasons
  - low-poly-trees-near-set-and-handover
  - webgl2-renderer-and-textures
  - bantha-jungle-overview
  - professions-gathering-nodes-and-motherlodes
  - sky-weather-and-lighting
invariants:
  - "Gameplay (cover, Logging nodes, wind sway shares, colliders) reads classic flat data, never the mod toggle."
  - "Wild flat positions never depend on the toggle: VERGE1 reads LPT_CROWNS footprints on every client."
  - "Road and trunk clearance only scales a tree down (lptFitCap / lptTrunkCap, floor LPT_FIT_FLOOR). It never moves the root."
  - "A record the player lacks yields no tree: farPicture answers null and the classic flat stands."
  - "Every allocation has an owner: a pixel acquires its handles and releases them when it goes, including failed builds via releasedBuild."
traps:
  - "There is no lowPolyTreesFrame function. The frame entry is createTreesHost().frame."
  - "The mod switch is read once at world load (lowPolyTreesOn). Toggling mid-session does not rebuild."
dfu: []
tags:
  - low-poly-trees
  - lpt1
  - rendering
  - trees
  - mods
  - flats
---

# Low Poly Trees: 3D Trees Near, Far Pictures Beyond, Flats Untouched

The LowpolyTrees 5 integration (`vendor/low-poly-trees/lowpolytrees.dfmod.json` by SquidKamer) replaces classic nature flats in archives `500` through `511` (`LPT_ARCHIVES`) with `253` low-poly 3D prefabs near the camera and matching far pictures beyond, while keeping all gameplay authority on classic flat data.

- **Activation and asset ownership (`src/mods/lowPolyTreesAssets.js`, `src/world/treesHost.js`):** `lowPolyTreesOn` checks `modSetting('low-poly-trees', 'Enabled')` once at world load unless disabled by the `?trees=off` URL parameter in `src/scenes/world.js` or `src/scenes/exterior.js`. Vendored geometry and atlas layouts under `vendor/low-poly-trees/Trees/` (`trees.json`, `trees.bin`, and `atlases.bin`) fetch lazily when a terrain pixel first requests a tree. `createTreesHost` drives both the Low Poly Trees door and the Bantha jungle door on separate renderer slots via `createTreesHost().frame`. Every pixel owns its acquired handles and releases them on eviction or failed build (`releasedBuild` in `src/world/pixelBuild.js`). If a player lacks an underlying archive record, `farPicture` returns `null` and the classic flat remains.
- **Deterministic placement and scaling (`src/world/lptCrowns.js`, `src/world/roadVerge.js`, `src/homes/yardNature.js`):** Collision, AI cover, wind sway shares, and Logging nodes always read classic flats. Every client positions wild flats identically because road clearance (`VERGE1`) always consults `LPT_CROWNS` footprints regardless of the mod switch. Clearance clamping (`lptFitCap` and `lptTrunkCap`, floored at `LPT_FIT_FLOOR`) only scales a mesh down without shifting its root. Location trees use scale `1`, wild trees vary between `LPT_SCALE_MIN` (`0.6`) and `LPT_SCALE_MAX` (`1.4`) via `lptVariety`, and home yard trees enter the near set via `yardTreeSet` (`src/homes/homeYards.js`), shifting in place on origin recenter.
