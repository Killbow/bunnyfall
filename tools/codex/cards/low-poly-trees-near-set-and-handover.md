---
slug: low-poly-trees-near-set-and-handover
title: "Low Poly Trees Near Set, Instanced Draw, and Bayer Crossfade"
domain: rendering
kind: subcard
parent: low-poly-trees-overview
files:
  - src/world/lowPolyTrees.js
  - src/mods/lowPolyTreesAssets.js
  - src/world/treesHost.js
  - src/render/lowPolyTreesRender.js
  - src/render/lowPolyTreesGlsl.js
  - src/render/renderer.js
  - src/render/meshAlpha.js
  - src/ai/cover.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Low-Poly-Trees.md"
related:
  - low-poly-trees-overview
  - low-poly-trees-atlas-painting-and-seasons
  - webgl2-renderer-and-textures
  - sky-weather-and-lighting
invariants:
  - "3D trees stand within LPT_NEAR_M (140 m) and crossfade over LPT_BAND_M (20 m). Far pictures stand everywhere else."
  - "The handover is a complementary bayer4 screen-door on vFade, so each pixel shows the tree or the picture, never both and never neither."
  - "cullNear frustum-culls every frame. gatherNear reruns only when the eye moves LPT_REGATHER_M (3 m), a pixel changes, or the felled stamp moves."
  - "Felled trees (FELLED in src/ai/cover.js) are skipped from the near set at once."
  - "Trees draw after the opaque flats through BB_VS mesh mode (uMesh = 1) and leave the program in flat mode (uMesh = 0). Per-flat state (hit flash, elite glow, tint, dissolve) is cleared first."
traps:
  - "A submesh with cull 2 enables CULL_FACE. The flats pass expects it disabled again afterwards."
  - "uMeshAlpha 0 means an opaque card. Above 0 the alpha is scaled to the flats 0.5 cut."
  - "`BB_VS` in renderer.js hardcodes the far-picture light (`0.6` up, `0.8` toward the camera) and the `0.72 + 0.28 n.l` law, so changing `LPT_IMPOSTOR_LIGHT` or `lptShade` needs the matching shader change."
dfu: []
tags:
  - low-poly-trees
  - instancing
  - culling
  - crossfade
  - dither
  - lighting
---

# Low Poly Trees Near Set, Instanced Draw, and Bayer Crossfade

Near-field 3D trees render within `LPT_NEAR_M` (`140` meters) and transition to far-picture billboards across a `LPT_BAND_M` (`20` meter) ring using a complementary ordered dither.

- **Gathering and frustum culling (`src/world/lowPolyTrees.js`, `src/world/treesHost.js`, `src/ai/cover.js`):** Each set row occupies `LPT_SET_FLOATS` (`6`) floats. `gatherNear` rebuilds the near set only when the eye moves by `LPT_REGATHER_M` (`3` meters), a terrain pixel changes, or the felled-tree stamp advances. Trees in `FELLED` (`src/ai/cover.js`) are skipped immediately. `cullNear` frustum-culls the gathered set every frame into compact `LPT_INSTANCE_FLOATS` (`5`: `[x, y, z, yaw]` plus `scale`) instance buffers.
- **Complementary Bayer handover (`src/render/lowPolyTreesGlsl.js`, `src/render/meshAlpha.js`):** Across the `20` meter band (`uLptCut` and `uLptBand`), the shader evaluates a `bayer4` screen-door threshold against `vFade` so each screen pixel shows either the 3D mesh or the far picture without overlap or gaps. `uMeshAlpha` `0` denotes an opaque card; positive values scale alpha against the `0.5` flat cutout threshold.
- **Shared billboard shader pass (`src/render/lowPolyTreesRender.js`, `src/render/renderer.js`):** All meshes share one vertex buffer and one `u32` index buffer in `LowPolyTreesGpu`. After opaque flats draw, the pass clears per-flat state (hit flash, elite glow, tint, and dissolve), enters `BB_VS` mesh mode (`uMesh = 1`) with `uMeshScale`, `uMeshColor`, `uLptSun`, and `uSunLift`, and scales sunlight by `clamp(sunScale / LPT_SUN_FULL, 0, 1)` (`LPT_SUN_FULL` `0.25`) down to far-picture lighting at night. Submeshes with `cull === 2` enable `CULL_FACE`, and the pass restores `CULL_FACE` off and `uMesh = 0` afterward.
