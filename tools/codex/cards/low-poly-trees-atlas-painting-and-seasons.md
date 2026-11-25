---
slug: low-poly-trees-atlas-painting-and-seasons
title: "Low Poly Trees Atlases Painted from ARENA2, Far Pictures, and Seasons"
domain: rendering
kind: subcard
parent: low-poly-trees-overview
files:
  - src/world/lowPolyTrees.js
  - src/mods/lowPolyTreesAssets.js
  - src/world/treesHost.js
  - src/mods/seasonsIliacBay.js
  - src/render/renderer.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Low-Poly-Trees.md"
related:
  - low-poly-trees-overview
  - low-poly-trees-near-set-and-handover
  - webgl2-renderer-and-textures
invariants:
  - "No mod texture is shipped. Atlases are painted from the player TEXTURE.500-511 records as blits plus synthesized fills (synthTop, tileCrop, fitRecord)."
  - "Mips are alpha-weighted (atlasMips/atlasMipSteps), so leaf edges never darken toward clear texels."
  - "Atlases sample Point style: NEAREST_MIPMAP_NEAREST / NEAREST with REPEAT (createAtlasTexture)."
  - "A prototype is painted under a season only when Seasons of the Iliac Bay re-skins its own archive. While seasons.installing is true it uses classic records ('')."
traps:
  - "The handle source key is s<installedSeason>.<generation>. A new install generation invalidates seasonal handles."
  - "The far picture uploads as a flat named `${record}#lpt${source}`. Do not collide with that suffix."
dfu: []
tags:
  - low-poly-trees
  - atlas
  - impostor
  - seasons
  - sib
  - textures
---

# Low Poly Trees Atlases Painted from ARENA2, Far Pictures, and Seasons

Low Poly Trees ships no prebaked textures. Instead, `src/world/lowPolyTrees.js` and `src/mods/lowPolyTreesAssets.js` synthesize mesh atlases and far-picture impostors at runtime directly from the player's loaded `TEXTURE.500` through `TEXTURE.511` archives.

- **Atlas synthesis and mipchains (`src/world/lowPolyTrees.js`, `src/render/renderer.js`):** Each atlas combines direct record blits with synthesized bark and foliage regions (`synthTop`, `tileCrop`, and `fitRecord`). Mip levels are built incrementally by `atlasMips` and `atlasMipSteps` at `LPT_MIP_TEXELS` (`16384`) texels per step using alpha-weighted averaging so leaf cutouts never bleed dark transparent borders. `createAtlasTexture` configures WebGL textures with `REPEAT` wrapping and point filtering (`NEAREST_MIPMAP_NEAREST` minification and `NEAREST` magnification), streaming `LPT_ATLAS_BAND` (`128`) rows per frame slice through `uploadAtlasRows`.
- **Far-picture impostors (`src/world/lowPolyTrees.js`):** `renderImpostor` and `impostorSteps` software-rasterize each prototype into a billboard flat at `LPT_IMPOSTOR_PER_M` (`8`) texels per meter (clamped to `24..256`), advancing `LPT_IMPOSTOR_TEXELS` (`4096`) and `LPT_IMPOSTOR_TRIS` (`256`) per step under fixed lighting `LPT_IMPOSTOR_LIGHT` (`[0, 0.6, -0.8]`). The resulting sprite uploads to the renderer under the flat key `${record}#lpt${source}`.
- **Seasonal keys and cache eviction (`src/world/treesHost.js`, `src/mods/seasonsIliacBay.js`):** When Seasons of the Iliac Bay re-skins an archive, handles key their source as `s<installedSeason>.<generation>` so a new generation invalidates stale seasonal handles; while `seasons.installing` is true, requests fall back to the classic `''` source. Unheld handles and unused GPU atlases release after `LPT_IDLE_S` (`30` seconds), while the ~4 MB CPU atlas buffer drops `LPT_PIC_IDLE_S` (`10` seconds) after its last far-picture bake and repaints on demand.
