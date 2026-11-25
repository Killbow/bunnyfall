---
slug: sky-ketch-look-palette-and-grain
title: "Sky-Ketch Look: Indexed Dwarven Palette, Meanings, and Value Ladder"
domain: rendering
kind: subcard
parent: sky-ketch-look-overview
files:
  - src/world/ketch/ketchLook.js
  - src/world/ketch/ketchArt.js
  - src/world/sdPixelKit.js
  - src/world/sdLook.js
  - src/characters/dyes.js
  - src/render/retroPass.js
  - src/systems/ketch/ketchDeckHost.js
  - src/systems/ketch/ketchFight.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sky-Ketch-Look.md"
related:
  - sky-ketch-look-overview
  - sky-ketch-look-hourly-light-and-air
  - super-dungeon-look-overview
  - tonal-warden-fight-and-downed-crew
invariants:
  - "Every ketchArt() texel is a KT_PAL step: an ART_PAL index plus a port fallback color within 24 sRGB of it. No palette bytes are committed."
  - "Her metal is METAL_TABLES.Dwarven (indices 144-159), and her steel is the darkest grays below METAL_TABLES.Iron."
  - "ketchLook.js is a leaf that imports nothing, so passes, probes and tests can all read it."
traps:
  - "KT_MEANING copies colors from KT_LAMP (ketchModel), KT_GLOWS (ketchDeckHost) and SD_LIGHT (sdLook). It must be pinned equal to those homes, not re-pointed."
  - "The Hour quantize is untouched. Use quantizeIndexed for the Ketch."
dfu: []
tags:
  - palette
  - art-pal
  - dwarven
  - pixel-art
  - value-ladder
  - accessibility
---

# Sky-Ketch Look: Indexed Dwarven Palette, Meanings, and Value Ladder

`src/world/ketch/ketchLook.js` is a zero-import leaf module defining the Sky-Ketch indexed material ramps (`KT_PAL`), semantic emissive colors (`KT_MEANING`), and display luminance bounds (`KT_LADDER`).

- **Indexed Dwarven Ramps (`KT_PAL`):** Every procedural texel generated in `src/world/ketch/ketchArt.js` maps to a `{idx, fallback}` pair in `KT_PAL`, combining a Daggerfall `ART_PAL` index with a fallback sRGB color within 24 units so no palette bytes are committed. Hull brass uses `METAL_TABLES.Dwarven` (indices `144-159` from `src/characters/dyes.js` and `src/render/retroPass.js`), while dark steel sits in the darkest grays below `METAL_TABLES.Iron`. The nineteen ramps are `dwarven`, `rubbed`, `glint`, `burnished`, `rust`, `copper`, `verdigris`, `steel`, `stone`, `aether`, `ember`, `lamp`, `gilt`, `cloud`, `cloudBlue`, `field`, `meadow`, `soil`, and `water`.
- **Indexed Quantization and Interim Warden Dye:** `quantizeIndexed(img, ramps)` in `src/world/sdPixelKit.js` snaps procedural art to the nearest fallback and returns a one-byte index image (leaving the Hour `quantize` path untouched). At upload, `resolveKetchArt(art, rgb)` resolves indices against the player's `ART_PAL.COL`. In `src/systems/ketch/ketchFight.js`, `ktWardenDye` dyes the Iron Atronach enemy with `DYE_COLORS.Dwarven` and `KT_WARDEN_DARKS` at upload.
- **Semantic Lights and Value Ladder:** `KT_MEANING` mirrors `lamp`/`lampBelow` (`KT_LAMP`), `aether`/`aetherTrue` (`KT_GLOWS` in `src/systems/ketch/ketchDeckHost.js`), and `ember`, `red`, and the white-gold beat (`SD_LIGHT` in `src/world/sdLook.js`). `KT_LADDER` pins display luma: deep sky `dayMax = 0.40` and `nightMax = 0.06`, below-deck `p50 = 0.08`, `telegraphFloor = 0.25`, and `pool = 0.30`, open deck `noonFloorMean = 0.22`, `noonFloorP95 = 0.30`, `duskP50 = 0.10`, and `max = 0.5`, cabin `p50 = [0.15, 0.35]`, ambient `0.30-0.45`, signal `0.5-0.8`, and critical `min = 0.7`, `peak = 0.85`.
