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
  - src/render/billboardKey.js
  - src/render/skinPalette.js
invariants:
  - "External WebGL passes must call renderer.markForeignPass() afterward so cached program, VAO, and cloud-shadow state resets."
  - "Evicted pixels, closed modal contexts, and dynamic skins must release their VBO, IBO, VAO, FBO, and texture handles."
traps:
  - "World billboard shaders sample bottom-up texels while UI canvases are top-down RGBA; pass { bottomUp: true } to cropRgba or sprites render upside down."
  - "`sortByKey` (`src/render/billboardKey.js`) must give exactly the order of a stable string sort of the texture keys, because at an exact depth tie the first drawn cutout quad keeps the pixel."
  - "The projection mirrors NDC x and the renderer sets `frontFace(CW)`, so only world passes may draw with `CULL_FACE` on, and every other pass must turn culling off around its draw."
  - "The cloud deck (`setCloudShadow`), the deep-water fog, the jungle haze (`setJungleHaze`), and the travel-view focus (`setFocus`) are per-frame state that `beginFrame` clears, so a host must set them again every frame."
  - "Texture units are claimed by constants in separate modules, such as `1`, `6`, and `7` for water, `3` to `5` for ecotones, `6` for the billboard surface, `8` for the shadow lo tier, `9` and `10` for light clusters, `11` and `12` for the air pass, `13` and `14` for sun and point shadows, `15` for the cloud shadow, `16` to `20` for snow, `21` for the skin palette (`SKIN_PALETTE_UNIT`), `22` for the view pane, and `23` for snow lines; check every `*_UNIT` constant before a new pass takes one."
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
