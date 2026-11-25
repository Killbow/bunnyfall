---
slug: webgl2-renderer-and-textures
title: WebGL2 Renderer, Texel Order, and GPU Teardown
domain: rendering
kind: overview
files:
  - src/render/renderer.js
  - src/render/staticBatch.js
  - src/render/glRelease.js
  - src/formats/textureFile.js
  - src/net/remotePlayers.js
invariants:
  - "External WebGL passes must call renderer.markForeignPass() afterward so cached program, VAO, and cloud-shadow state resets."
  - "Evicted pixels, closed modal contexts, and dynamic skins must release their VBO, IBO, VAO, FBO, and texture handles."
traps:
  - "World billboard shaders sample bottom-up texels while UI canvases are top-down RGBA; pass { bottomUp: true } to cropRgba or sprites render upside down."
dfu:
  - Assets/Scripts/API/TextureFile.cs
  - Assets/Scripts/MaterialReader.cs
tags:
  - webgl2
  - renderer
  - textures
  - billboards
  - gpu
---

# WebGL2 Renderer, Texel Order, and GPU Teardown

`Renderer` (`src/render/renderer.js`) is a custom WebGL2 pipeline with no external engine. It uploads indexed textures with `REPEAT` wrapping and `NEAREST` filtering, keeping opaque palette-index `0` mortar on world meshes while discarding alpha-zero cutouts on billboards. Static geometry merges per texture via `StaticBatchBuilder` (`src/render/staticBatch.js`).

- **Bottom-up texels vs top-down UI crops:** `TextureFile.getColor32` (`src/formats/textureFile.js`) emits bottom-up rows matching native WebGL texel order (`flipY` disabled), so world billboard shaders sample bottom-up. UI and paperdoll canvases are top-down RGBA; cropping peer or patron paperdolls into world billboards must pass `{ bottomUp: true }` to `cropRgba` (`src/net/remotePlayers.js`) or sprites render upside down.
- **Program binding and foreign passes:** Every `Renderer` draw entry point binds its shader and VAO through `_use` and `_bindVao` shadows. External GL passes (such as sky, clouds, precipitation, or NPC marks) must call `renderer.markForeignPass()` afterward so cached program, VAO, and cloud-shadow bindings reset.
- **Matching GPU teardown:** Evicted pixels, closed modal contexts, and dynamic skins must release their VBO, IBO, VAO, FBO, and texture handles (`glRelease.js` drops contexts on page unload).
