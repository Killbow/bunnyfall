---
slug: poi-gltf-uv-and-packs
title: POI glTF Import/Export, UV Editor, and Packs
domain: poi
kind: subcard
parent: poi-editor-and-approvals-overview
files:
  - src/poi/gltfImport.js
  - src/poi/gltfExport.js
  - src/poi/uv/uvEdit.js
  - src/poi/uv/uvMesh.js
  - src/poi/uv/uvUnwrapClient.js
  - src/poi/uv/uvUnwrapWorker.js
  - src/poi/sparseCholesky.js
  - src/poi/poiPack.js
  - src/poi/poiDiff.js
  - src/poi/poiText.js
  - src/poi/poiThumb.js
routes: []
tables: []
replacesBible:
  - "06-Systems/POI-Editor-Arc.md"
related:
  - poi-editor-and-approvals-overview
  - poi-document-and-mesh-law
invariants:
  - "`readGltf` rejects node cycles and multi-parent nodes with `GltfError`, enforcing `GLTF_READ_LIMITS` derived from `POI_MESH_LIMITS`."
  - "glTF export mirrors the X axis across positions, normals, and translations, transforms rotations to `(x, -y, -z, w)` via `mirrorQuatX`, and reverses triangle winding."
  - "UV undo retains up to `UV_UNDO_DEPTH` (`100`) steps within `UV_UNDO_BYTES` (`128` MiB), evicting the oldest entries first while always preserving the latest step."
traps:
  - "When the background unwrap worker fails, `src/poi/uv/uvUnwrapClient.js` falls back to unwrapping on the main thread, causing a synchronous pause rather than throwing an error."
  - "`readPackBytes` validates the ZIP central directory before inflating entries and rejects any entry that inflates beyond its declared size (`POI_PACK_LIMITS`: `500` POIs, `2000` shelf entries, `20,000` files, and `1` GiB total)."
dfu: []
tags:
  - poi
  - gltf
  - uv
  - lscm
  - pack
  - diff
---

# POI glTF Import/Export, UV Editor, and Packs

Builders import and export glTF scenes, unwrap and pack UV islands, bundle POIs into portable ZIP packs, and inspect visual diffs before approval.

- **glTF import and export (`src/poi/gltfImport.js`, `src/poi/gltfExport.js`):** `readGltf` parses `.gltf` and `.glb` inputs under `GLTF_READ_LIMITS` (derived from `POI_MESH_LIMITS`), throwing `GltfError` on node cycles or shared child nodes. `bakeGltf` converts imported hierarchies into POI meshes and point or spot lights (`poiLightOf`). On export, `gltfExport.js` mirrors X coordinates for positions, normals, and translations, converts quaternions through `mirrorQuatX` (`(x, -y, -z, w)`), and flips triangle winding to convert between coordinate handedness.
- **UV editor and LSCM solver (`src/poi/uv/uvEdit.js`, `src/poi/uv/uvMesh.js`, `src/poi/sparseCholesky.js`):** `uvSessionOf` builds a topological session by welding vertices within `weldEps` (`1e-5`) on a spatial grid. `UV_MODES` (`vertex`, `edge`, `face`, and `island`) support seam marking, planar, box, cylinder, and sphere projections, `unwrapLscm`, `packIslands`, and texel-density scaling, writing modified UVs back via `meshFromSession`. `unwrapLscm` solves Least Squares Conformal Maps using an up-looking sparse Cholesky factorization (`src/poi/sparseCholesky.js`, modeled on `cs_chol` from CSparse) inside `src/poi/uv/uvUnwrapWorker.js` via `src/poi/uv/uvUnwrapClient.js`, falling back to gradient projection where conformal factorization fails.
- **Packs, diffs, and thumbnails (`src/poi/poiPack.js`, `src/poi/poiDiff.js`, `src/poi/poiText.js`, `src/poi/poiThumb.js`):** `readPackBytes` enforces `POI_PACK_LIMITS` and formats errors with `packErrorText`. Approvers inspect structural changes via `poiDiff(before, after)` and `diffText`, while `src/poi/poiThumb.js` rasterizes wireframes using the top-left fill rule so shared edges draw once.
