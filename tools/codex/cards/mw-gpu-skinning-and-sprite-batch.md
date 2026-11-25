---
slug: mw-gpu-skinning-and-sprite-batch
title: "GPU Skinning, One-Bind Sprite Batch, and Mesh/Texture Caches"
domain: rendering
kind: subcard
parent: morrowind-npc-bodies-overview
files:
  - src/formats/mwGpuSkin.js
  - src/render/renderer.js
  - src/render/skinPalette.js
  - src/render/characterSprite.js
  - src/combat/fpArm.js
  - src/render/dissolve.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Morrowind-NPCs.md"
related:
  - morrowind-npc-bodies-overview
  - webgl2-renderer-and-textures
  - npc-lanes-frame-budget-and-build-gate
invariants:
  - "Third-person bodies skin in `CHAR_SKIN_VS` (`src/render/renderer.js`) from a `packSkinStream` stream and a `writeSkinPalette`/`updateSkinPalette` palette texture; no CPU vertex re-blend."
  - "The first-person arm keeps CPU skinning for held-sheet and muzzle attachment transforms."
  - "`SKIN_MAX_INFLUENCES = 8`; a vertex with more influences is refused by `skinLayout` (never trimmed) and stays on the CPU path."
  - "`beginCharacterSpriteBatch`, `queueCharacterSprite`, and `flushCharacterSpriteBatch` bind the offscreen target once per pass; `packSpriteTiles` packs tiles and `drawCharacterSpriteQuad` composites the quads."
  - "`queueCharacterSprite` rejects non-finite sprite dimensions so atlas packing is never corrupted."
  - "`nifBytes` caches parsed NIF bytes by archive and path up to `NIF_COPY_CAP = 384`; `acquireCharacterTexture` and `releaseCharacterTexture` share decoded GL textures across bodies."
  - "A skinned depth program runs in shadow passes so bodies cast geometric shadows; actors past `DISSOLVE_SHADOWLESS = 0.5` cast none."
traps:
  - "Moving the first-person arm to GPU skinning loses CPU-side attachment matrices."
  - "Releasing a skin without `releaseCharacterSkin` leaves a stale palette replayed for the next body."
dfu: []
tags:
  - gpu-skinning
  - webgl2
  - batching
  - shadows
  - caching
---

# GPU Skinning, One-Bind Sprite Batch, and Mesh/Texture Caches

Third-person 3D bodies combine WebGL2 vertex-shader skinning, single-bind offscreen atlas rendering, and shared NIF/texture caches (`src/formats/mwGpuSkin.js`, `src/render/renderer.js`, `src/render/skinPalette.js`, and `src/render/characterSprite.js`).

- **Vertex-shader skinning (`mwGpuSkin.js`, `renderer.js`, `skinPalette.js`, `fpArm.js`):** `packSkinStream` packs bone weights up to `SKIN_MAX_INFLUENCES` (`8`), and `createSkinnedCharacterMesh` uploads the stream to `CHAR_SKIN_VS` (paired with `skinFaceFs`) alongside an `RGBA32F` bone palette updated via `writeSkinPalette` and `updateSkinPalette`. Any mesh exceeding eight influences is rejected by `skinLayout` rather than truncated and falls back to CPU skinning. The first-person arm in `src/combat/fpArm.js` (which loads `ESM_MASTERS`: `morrowind.esm`, `tribunal.esm`, and `bloodmoon.esm`) stays on CPU skinning so weapon sheets and muzzle flashes can read bone attachment matrices directly. Disposing a rig requires `releaseCharacterSkin` to clear its palette slot.
- **One-bind sprite batch and shadows (`characterSprite.js`, `dissolve.js`):** `beginCharacterSpriteBatch`, `queueCharacterSprite` (which rejects non-finite dimensions), and `flushCharacterSpriteBatch` bind the offscreen framebuffer once per frame, pack tiles with `packSpriteTiles`, and draw world quads via `drawCharacterSpriteQuad`, `drawRigSpriteBox`, and `pictureUp`. Skinned depth passes cast geometric shadows until dissolve progress exceeds `DISSOLVE_SHADOWLESS` (`0.5`).
- **Mesh and texture caches (`mwGpuSkin.js`):** `nifBytes` caches parsed NIF buffers up to `NIF_COPY_CAP` (`384`), while `acquireCharacterTexture` and `releaseCharacterTexture` reference-count shared WebGL textures.
