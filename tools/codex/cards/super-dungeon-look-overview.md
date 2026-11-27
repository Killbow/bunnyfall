---
slug: super-dungeon-look-overview
title: "Abyss Dungeon Look: Palette, Five Lights, Value Ladder, and Escapement"
domain: multiplayer
kind: overview
parent: null
files:
  - src/world/sdLook.js
  - src/world/sdRealmArt.js
  - src/world/sdPixelKit.js
  - src/render/orderedDither.js
  - src/render/airPass.js
  - src/render/renderer.js
  - src/render/auraRing.js
  - src/render/gateTelegraph.js
  - src/tools/abyssLab.js
  - src/world/sdRiftModel.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Super-Dungeons-Look.md"
related:
  - abyss-dungeons-overview
  - super-dungeon-look-rift-return-and-veil
  - super-dungeon-look-hour-sky-islands-and-steps
  - super-dungeon-look-arena-and-remnant-rig
  - sky-weather-and-lighting
invariants:
  - "Four rules govern the visual language (`src/world/sdLook.js`): the void reads as black after grading, metal and stone act as unlit structure, light appears only where it carries gameplay meaning, and every surface renders as Daggerfall pixel art."
  - "Emitted light comes strictly from `SD_LIGHT`: `gold` (live machine), `mantella` (soul of the Hour), `ember` (about to fail), `moon` (way out), `red` (refused or the End), and `moment` (a beat lands)."
  - "`SD_LADDER` caps display luminance at `void = 0.04`, `haze = 0.18`, `structure = 0.25`, `ambient = 0.45`, `signal = 0.8`, and `critical = 0.85`; only `signal` and `critical` may bloom."
  - "Every signal must remain readable by shape, position, and motion alone, verified in grayscale via `abyss.html?grey` (`src/tools/abyssLab.js`)."
  - "Flash and throb frequencies never exceed `TELEGRAPH_THROB_MAX_HZ` (`3` Hz in `src/render/gateTelegraph.js`)."
  - "Clockwork hands advance via `sdTick(t)` in whole steps at each anchored second, eased over `SD_TICK_EASE_S` (`0.25` s, matching `TURNING_STEP_S`) without moving backward."
  - "Textures sample with nearest-neighbor filtering and `TEXTURE_MAX_LEVEL = 0` (no mipmaps) even outside Retro Mode."
traps:
  - "`src/world/sdLook.js` mirrors light constants from their owning modules (`SD_LAMP_COLOR`, `SD_FX_COLOR`, `SD_GLOW_COLORS`, and `SD_BEAM_CORE`); always edit the owning module because tests assert equality."
  - "`SD_HOUR_GRADE` applies only on the Shattered Hour lane renderer via `setSceneGrade`, while the Hollow retains default `AIR_ADAPT_KEY` (`0.18`) and `AIR_ADAPT_MAX` (`1.8`)."
  - "The renderer uploads a picture's first row at v 0 with no flip, so `cell` runs v down the atlas rows with `t`. Running v up from the last row draws every cell mirrored across the atlas."
dfu: []
tags:
  - super-dungeons
  - abyss-dungeons
  - visual-language
  - palette
  - lighting
  - pixel-art
---

`src/world/sdLook.js` defines the visual grammar, palette ramps, luminance hierarchy, and clockwork motion laws for Abyss Dungeons and the Shattered Hour.

## Palette Ramps, Value Ladder, and Grading

`SD_RAMP` provides sRGB material ramps of at least five steps for `void`, `basalt`, `cobble`, `brass`, `verdigris`, `bronze`, `silver`, `pale`, `earth`, and `baySky`, with `SD_STONE` (`[34, 30, 28]`) and `SD_BRASS` (`[196, 146, 64]`) as the middle basalt and brass steps. Procedural textures (`src/world/sdRealmArt.js` and `src/world/sdPixelKit.js`) combine seeded noise, `BAYER4` dithering, bevels, rivets, and palette quantization with shader posterization (`SD_PIXEL_GLSL` and `BAYER_GLSL` in `src/render/orderedDither.js`), uploaded with nearest-neighbor filtering and `TEXTURE_MAX_LEVEL = 0` (`src/render/renderer.js`).

`SD_LADDER` enforces luminance tiers (`void = 0.04`, `haze = 0.18`, `structure = 0.25`, `ambient = 0.45`, `signal = 0.8`, and `critical = 0.85`). Inside the Hour, `setSceneGrade` applies `SD_HOUR_GRADE` (`adaptKey = 0.12`, `adaptMax = 1.15`, `bloom = 0.8`, `vignette = 0.34`, and `contrast = 1.08`), keeping the `void` ramp black below `AIR_BRIGHT_THRESHOLD` (`0.85` in `src/render/airPass.js`).

## Lights, Escapement, and Lab Views

Emissive colors come from `SD_LIGHT` (`gold`, `mantella`, `ember`, `moon`, `red`, and `moment`), capped at `TELEGRAPH_THROB_MAX_HZ` (`3` Hz in `src/render/gateTelegraph.js` and `src/render/auraRing.js`). `sdTick(t)` steps hands over `SD_TICK_EASE_S` (`0.25` s), while `handToTwelve(remaining, total)` turns countdown hands counterclockwise inside the Hour and clockwise on exits. `src/tools/abyssLab.js` (`abyss.html`) exposes test views via query parameters (`rift`, `fight`, `beat`, `hours`, `lit`, `fray`, `concord`, `grey`, and `law`).
