---
slug: blood-atlas-drying-and-wet-film
title: "Procedural Blood Atlas, Drying, and the Wet Film Shader"
domain: combat
kind: subcard
parent: blood-marks-overview
files:
  - src/combat/bloodArt.js
  - src/combat/bloodMarks.js
  - src/render/renderer.js
  - src/render/enhancedLighting.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Blood-Arc.md"
related:
  - blood-marks-overview
  - blood-spray-overkill-and-gibs
  - sky-weather-and-lighting
invariants:
  - "Atlas texels are white ink holding shape and depth. All color comes from the vertex tint (`BLOOD_BASE`, `FRESH_VARIANCE`, `driedTint`)."
  - "A decal vertex is `DECAL_FLOATS_PER_VERTEX` (`10`) floats (`pos3`, `uv2`, `rgba4`, `wet1`), lifted `SURFACE_LIFT` (`0.02`). `drawDecals` sets `depthMask(false)`, and dirty slot runs upload in single `bufferSubData` calls."
  - "Every interpolated shader constant goes through `glslFloat`."
traps:
  - "Thinning blood desaturates toward pink, not orange, because green and blue absorption are equal (`0.95`)."
  - "The classic shader must use `BLOOD_ABSORB_ENCODED` (`BLOOD_ABSORB / DISPLAY_GAMMA` `2.2`), not the raw values."
  - "Wetness falls faster than color: `wetAt = (1 - stage/8)^WET_POWER` (`2`)."
dfu: []
tags:
  - blood
  - atlas
  - shader
  - enhanced-lighting
  - drying
---

`src/combat/bloodArt.js`, `src/combat/bloodMarks.js`, `src/render/renderer.js`, and `src/render/enhancedLighting.js` build the decal atlas, dry marks, and render Beer-Lambert absorption with specular sheen.

## Procedural Atlas and Vertex Buffer

`bloodArt.js` registers pseudo-archive `BLOOD_ATLAS_ARCHIVE` (`38001`, record `'marks'`) as an `ATLAS_SIZE` (`1024`) sheet with `8` cells across `ATLAS_KINDS` (`pool`, `spatter`, `streak`, `drip`, and `print`) using a seeded `mulberry32` PRNG. `atlasBuilder` spreads generation over idle frames, `prewarmBloodAtlas` starts ahead of use, and `bloodDropletArt` is `16` px (`DROP_ART_SIZE`). White ink texels store shape and depth while vertex tint supplies hue.

Each vertex holds `DECAL_FLOATS_PER_VERTEX` (`10`) floats (`pos3`, `uv2`, `rgba4`, `wet1`) lifted by `SURFACE_LIFT` (`0.02`). `drawDecals` sets `depthMask(false)` and uploads dirty slot runs in single `bufferSubData` calls.

## Drying and Wet Film Shader

Marks dry across `DRY_STAGES` (`8`) over `DRY_TIME` (`180` s) at `DRY_TICK` (`2` s), shifting from `BLOOD_BASE` (`FRESH_VARIANCE`) to `DRIED_TINT` (`[0.3, 0.13, 0.09]`) via `driedTint`, while wetness drops via `wetAt = (1 - stage/8)^WET_POWER` (`WET_POWER = 2`).

In GLSL (constants formatted via `glslFloat`), film depth is `thick = (1 - t.r)/INK_DEPTH` (`0.18`) and `color = tint * exp(BLOOD_ABSORB * (1 - thick))` with `BLOOD_ABSORB` `[0.5, 0.95, 0.95]`. Equal green and blue absorption shifts thin edges toward pink; the classic shader uses `BLOOD_ABSORB_ENCODED` (`BLOOD_ABSORB / DISPLAY_GAMMA`, `2.2`). Enhanced Lighting adds Schlick sheen (`EL_WET_GLOSS = 64`, `EL_WET_STRENGTH = 0.55`, `BLOOD_F0 = 0.02` via `wetFresnel`, and `BLOOD_MENISCUS = 0.85`) lit by sun, moon (`uDecalMoon`), and lanterns.
