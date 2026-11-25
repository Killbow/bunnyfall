---
slug: window-pane-depth-clip-and-body-batch-closure
title: "Real-Windows Pane Depth Clipping and Veiled 3D Body Batch Closure"
domain: rendering
kind: subcard
parent: shop-quest-spawns-chest-matching-and-owed-strikes-overview
files:
  - src/render/realWindows.js
  - src/render/renderer.js
  - src/scenes/exterior.js
  - src/scenes/world.js
  - src/travel/horseCartPool.js
  - tools/realWindowsProbe.mjs
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-12g.md"
related:
  - shop-quest-spawns-chest-matching-and-owed-strikes-overview
  - mw-gpu-skinning-and-sprite-batch
invariants:
  - "`src/render/realWindows.js` renders up to `VIEW_PANES_MAX` (`256`) window glass meshes into a dedicated depth target bound on texture unit `VIEW_PANE_UNIT` (`22`), sampled by exterior street shaders through `uPaneDepth` and `uPaneOn`."
  - "`drawVeiled3d` flushes open character batches inside a `finally` block, and `renderer.beginFrame` closes any dangling batch at frame start."
traps:
  - "Never revert interior window clipping to axis-aligned building-box discard, which clips across L-shaped, U-shaped, multi-model, and flush-adjacent buildings."
dfu: []
tags:
  - rendering
  - real-windows
  - depth
  - batches
---

# Real-Windows Pane Depth Clipping and Veiled 3D Body Batch Closure

Interior real-windows rendering clips exterior street geometry against a dedicated window-pane depth buffer while guaranteed batch closure prevents character rendering leaks across veiled 3D passes.

- **Window-pane depth target (`src/render/realWindows.js`, `src/scenes/exterior.js`, `src/scenes/world.js`, `tools/realWindowsProbe.mjs`):** `src/render/realWindows.js` renders up to `VIEW_PANES_MAX` (`256`) window glass meshes into a dedicated depth target bound on texture unit `VIEW_PANE_UNIT` (`22`). Exterior street shaders sample this target through the `uPaneDepth` and `uPaneOn` uniforms so exterior terrain, buildings, and props clip cleanly to visible glass panes.
- **Pane lifecycle and geometry safety (`src/render/realWindows.js`):** Pane target allocation, drawing, and teardown run through `_rwEnsureTarget`, `_rwPaneProgram`, `_rwDrawPanes`, `takeGlassRect`, `outsideViewFrame`, and `releaseOutsideView`. Never revert interior window clipping to an axis-aligned building-box discard, because box bounds clip falsely across L-shaped, U-shaped, multi-model, and flush-adjacent buildings.
- **Veiled 3D body batch closure (`src/render/renderer.js`, `src/travel/horseCartPool.js`):** `drawVeiled3d` flushes open character batches inside a `finally` block so early exits never leave a batch open, and `renderer.beginFrame` closes any dangling batch at frame start.
