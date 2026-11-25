---
slug: enhanced-lighting-air-pass-post-chain
title: "Enhanced Lighting Air Pass: AO, Bloom, Glare, Glow, Adaptation, Contact"
domain: rendering
kind: subcard
parent: enhanced-lighting-lane-overview
files:
  - src/render/airPass.js
  - src/render/renderTarget.js
  - src/render/renderer.js
  - src/render/volumetricClouds.js
  - src/render/perfMeter.js
routes: []
tables: []
replacesBible:
  - "07-Rendering/Enhanced-Lighting-Arc.md"
related:
  - enhanced-lighting-lane-overview
  - enhanced-lighting-shadow-maps-and-casters
  - webgl2-renderer-and-textures
invariants:
  - "AirPass binds an RGBA8 color + depth-texture frame in beginFrameTarget and resolves it on the first screen-space draw or at resolveFrame()."
  - "Foreign passes (volumetricClouds, sprite pass, withTarget) must rebind frameTarget(), never null, or they draw to the canvas behind the frame."
  - "AO_FS (GTAO): AIR_AO_DIRECTIONS = 2 slices x AIR_AO_SAMPLES = 6 steps, AIR_AO_FALLOFF = 0.6, AIR_AO_BLUR_SHARE = 0.15, applied as AIR_AO_RESOLVE = 0.75."
  - "Eye adaptation packs log2 over AIR_ADAPT_LOG_RANGE [-2, 2] into AIR_ADAPT_STEPS = 65535 (16 bits). It opens at AIR_ADAPT_OPEN = 0.6/s, closes at AIR_ADAPT_CLOSE = 3.0/s and stays within AIR_ADAPT_MIN 0.7 to AIR_ADAPT_MAX 1.8, with AIR_ADAPT_KEY = 0.18."
traps:
  - "AO_FS must compute dFdx/dFdy before the sky early-return. Derivatives inside non-uniform control flow are undefined in GLSL ES 3.00 and differ across vendors."
  - "Sprite passes, studio bakes, and panel brackets (`_spriteDepth`, `_studioDepth`, `_panelSaved`, `_panelLane`) turn off air-pass glow and other screen-space work; new offscreen passes must join those guards."
dfu: []
tags:
  - post-process
  - ao
  - bloom
  - adaptation
  - contact-shadow
---

# Enhanced Lighting Air Pass: AO, Bloom, Glare, Glow, Adaptation, Contact

`AirPass` (`src/render/airPass.js`) manages the offscreen RGBA8 color and depth-texture framebuffer (`src/render/renderTarget.js`) bound during `beginFrameTarget` and composited on the first screen-space overlay or at `resolveFrame()`.

- **Target discipline and offscreen brackets (`renderer.js`, `volumetricClouds.js`, `perfMeter.js`):** Auxiliary passes (`volumetricClouds`, sprite renders, `withTarget`) must restore `frameTarget()` rather than `null`. Offscreen brackets (`_spriteDepth`, `_studioDepth`, `_panelSaved`, `_panelLane`) suspend screen-space glow and post effects during UI or studio bakes.
- **GTAO and contact shadows:** `AO_FS` evaluates `dFdx` and `dFdy` prior to the sky early-return, marching `AIR_AO_DIRECTIONS = 2` slices by `AIR_AO_SAMPLES = 6` steps (`AIR_AO_FALLOFF = 0.6`, `AIR_AO_BLUR_SHARE = 0.15`, `AIR_AO_RESOLVE = 0.75`). Screen-space contact shadows march `AIR_CONTACT_STEPS = 4` over `AIR_CONTACT_LENGTH = 0.6` (`AIR_CONTACT_THICKNESS = 0.8`, `AIR_CONTACT_FLOOR = 0.15`, `AIR_CONTACT_RANGE_FRACTION = 0.7`) against previous-frame depth (`prevDepthUV`, `holdPrevRect`).
- **Volumetrics, bloom, glare, and adaptation:** `volFs` steps `AIR_VOL_STEPS = 8` jittered samples through `pointShadowOne` cube maps while unshadowed lights use `elScatter`. Bloom extracts highlights via `brightFs` (`AIR_BRIGHT_THRESHOLD = 0.85`, `AIR_BRIGHT_TAPS = 4`, `AIR_EMIT_SLACK = 0.15`, using RGBA16F where supported), paired with 28-tap lantern glares (`AIR_GLARE_TAPS = 28`, `AIR_GLARE_SIZE = 0.25`, `AIR_GLARE_SLACK = 0.25`, `AIR_GLARE_HOLD_BAND = 2`, `heldGlareRange`). Eye adaptation quantizes log2 luminance across `AIR_ADAPT_LOG_RANGE = [-2, 2]` into `AIR_ADAPT_STEPS = 65535` (`AIR_ADAPT_KEY = 0.18`, `AIR_ADAPT_OPEN = 0.6`, `AIR_ADAPT_CLOSE = 3.0`, clamped to `AIR_ADAPT_MIN = 0.7` and `AIR_ADAPT_MAX = 1.8`) before final grading (`AIR_VIGNETTE = 0.28`, `AIR_CONTRAST = 1.04`).
