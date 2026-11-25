---
slug: performance-rig-overview
title: "Performance Rig: Allocation-Free CPU Skin, GPU Bisect, and Frame Zones"
domain: rendering
kind: overview
parent: null
files:
  - src/formats/mwSkin.js
  - src/formats/mwFirstPerson.js
  - src/formats/mwGpuSkin.js
  - src/formats/mwNifMesh.js
  - src/combat/fpArm.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Performance-Rig.md"
related:
  - peer-body-pose-cadence-and-skin-budget
  - perf-meter-zones-ground-order-and-telegraph-bounds
  - mw-gpu-skinning-and-sprite-batch
  - performance-priority-overview
  - morrowind-npc-bodies-overview
invariants:
  - "`skinBatch` (`src/formats/mwSkin.js`) reuses per-batch scratch buffers from `skinScratch(batch, n)` (`{ acc, wsum, touched, collapse, composed, boneMat }`), reallocating only when vertex count `n` changes."
  - "`affineMulInto` writes `affineMul` products into an output buffer bit-for-bit, and `src/formats/mwGpuSkin.js` builds bone palette entries through the same helper so CPU and GPU skinning match."
  - "`packFpArm(pieces, out)` (`src/formats/mwFirstPerson.js`) resolves static lanes once per piece via `pieceLanes` (`diffuseAt`/`emissiveAt` in `src/formats/mwNifMesh.js`) and reuses range objects while pieces remain unchanged."
  - "`releaseGpu` clears `r.tex = null` after `releaseCharacterTexture` so reused ranges never carry a deleted `WebGLTexture`; third-person bodies skin on the GPU while the first-person arm stays on CPU (`?gpuskin=off` forces CPU bisect)."
traps:
  - "Allocating per call inside skinBatch or the pack loop brings back per-frame GC churn for every body."
  - "Dropping r.tex = null in releaseGpu hands a deleted WebGLTexture to the next mesh built from the same ranges."
dfu: []
tags:
  - performance
  - morrowind-rig
  - skinning
  - allocation
  - gpu-skinning
---

# Performance Rig: Allocation-Free CPU Skin, GPU Bisect, and Frame Zones

Morrowind 3D rig rendering eliminates per-frame array churn across CPU skinning, NIF piece packing, and GPU bone palette updates while scaling both first-person and third-person views through `MW_ARM_PIXEL` (`src/combat/fpArm.js`).

- **Scratch buffers and affine parity (`src/formats/mwSkin.js`, `src/formats/mwGpuSkin.js`):** `skinBatch` and `poseSkeleton` reuse per-batch scratch buffers from `skinScratch(batch, n)` (`{ acc, wsum, touched, collapse, composed, boneMat }`), reallocating only when vertex count `n` changes. `affineMulInto` writes `affineMul` products into preallocated output buffers bit-for-bit, and `mwGpuSkin.js` builds bone palette entries with the same helper so CPU and GPU skinning match.
- **Static piece lanes and GPU bisect (`src/formats/mwFirstPerson.js`, `src/formats/mwNifMesh.js`, `src/combat/fpArm.js`):** Alongside `poseAssembly`, `packFpArm(pieces, out)` resolves static lanes once per piece via `pieceLanes` (`diffuseAt` and `emissiveAt`) and reuses range descriptors while pieces stay unchanged. On teardown, `releaseGpu` clears `r.tex = null` after `releaseCharacterTexture` so reused ranges never retain deleted `WebGLTexture` handles. Third-person bodies skin on the GPU while the first-person arm stays on CPU (`pageParam('gpuskin')` with `?gpuskin=off` forces CPU bisect).
- **Subcards:** `peer-body-pose-cadence-and-skin-budget` and `perf-meter-zones-ground-order-and-telegraph-bounds`.
