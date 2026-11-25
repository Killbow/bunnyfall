---
slug: "terrain-water-ripples-wake-and-shader"
title: "Terrain Water Ripple Field, Boat Wake, Swell Fade, and Surface Shader"
domain: "rendering"
kind: "subcard"
parent: "terrain-water-bed-and-halo-overview"
files:
  - "src/world/waterRipples.js"
  - "src/render/waterSurface.js"
  - "src/render/renderer.js"
  - "src/scenes/exterior.js"
  - "src/tools/waterLab.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/audits/Audit-WATER-NEXT.md"
related:
  - "terrain-water-bed-and-halo-overview"
  - "naval-traffic-captain-ai-and-online-sea"
  - "deep-waters-overview"
invariants:
  - "Only hulls moving at or above `BOAT_WAKE_SPEED = 0.25` stir wakes, letting moored boats leave the ripple field asleep."
  - "Swimmer wake checks `player.isPlayerSwimming || player.swimming` across streaming and fixed-town hosts, and sliding a sleeping field shifts only the origin while keeping border texels at `128`."
  - "`SWELL_REACH = [300, 600]` fades distant vertical heave while preserving fragment surface slope."
  - "Ripple and frame-copy lookups sample `textureLod(..., 0.0)`, `beginFrame` clears the ripple field on reboot, and Deep Waters takes its own frame copy while mid-frame resolves drop cached copies."
traps:
  - "Wave underside discard (`uOpen`) activates only when swimming on open sea, and surface composition expects premultiplied alpha with affine fog."
dfu: []
tags:
  - "water"
  - "ripples"
  - "shader"
  - "wake"
---

# Terrain Water Ripple Field, Boat Wake, Swell Fade, and Surface Shader

`src/world/waterRipples.js` and `src/render/waterSurface.js` simulate local wakes and shade exterior water surfaces across streaming world and fixed-town exterior hosts (`src/scenes/exterior.js`, `src/tools/waterLab.js`).

- **Ripple field sleep and wake triggers:** The ripple simulation runs only in streaming world and fixed-town exterior hosts. Hulls stir wakes only at or above `BOAT_WAKE_SPEED = 0.25`, leaving the field asleep around moored boats. Swimmer wake checks `player.isPlayerSwimming || player.swimming` across both host types. Sliding a sleeping ripple field shifts only its world origin while preserving neutral border texels at `128`, and `beginFrame` (`src/render/renderer.js`) clears the ripple field on reboot.
- **Swell fade, frame copies, and shader composition:** `SWELL_REACH = [300, 600]` fades distant vertical heave while retaining fragment surface slope. Shader lookups sample ripple and frame-copy textures with `textureLod(..., 0.0)`. Deep Waters captures its own frame copy while mid-frame resolves drop cached copies. Wave underside discard (`uOpen`) engages only when swimming on open sea, and surface composition outputs premultiplied alpha with affine fog.
