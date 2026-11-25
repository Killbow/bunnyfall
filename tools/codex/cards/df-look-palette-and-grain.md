---
slug: df-look-palette-and-grain
title: "Palette Snap, Grain, and Alpha Preservation"
domain: render
kind: subcard
parent: df-look-overview
files:
  - src/world/dfLook.js
  - src/scenes/dataPipeline.js
routes: []
tables: []
replacesBible:
  - "01-Overview/DF-Art.md"
related:
  - df-look-overview
  - sky-ketch-look-palette-and-grain
invariants:
  - "Alpha is copied untouched; texels with alpha 0 keep their RGB byte-for-byte."
  - "Palette snap searches indices 1-255 only; index 0 is the clear texel."
  - "All 255 indices are kept (cream canvas needs the rare tans 16-31)."
traps:
  - "`HUE_WEIGHT` below 4 lets cream canvas fleck to pale mint; RGB/redmean distance hops hues."
  - "`setDfLookPalette` resets the LUT; the palette is `ART_PAL.COL` from `dataPipeline`."
dfu: []
tags:
  - dflook
  - oklab
  - grain
  - palette
---

# Palette Snap, Grain, and Alpha Preservation

In `src/world/dfLook.js`, `dfLook` transforms procedural RGBA pictures into the classic Daggerfall palette (`ART_PAL.COL`, loaded by `src/scenes/dataPipeline.js` and registered via `setDfLookPalette`) by adding multi-scale luminance grain and snapping each opaque texel in OKLab color space.

- **Stateless multi-scale grain (`DF_GRAIN` and `texelGrain`):** `lookSeed(archive, record)` computes `Math.imul(archive, 1000003) + record`. At each texel `(x, y)`, `texelGrain` hashes the seed and coordinates into `-1..1` without lattice periodicity or tiling seams. With `DF_GRAIN = 10`, luminance jitter is `DF_GRAIN * 0.5 * (texelGrain(seed, x, y) + texelGrain(~seed, x >> 1, y >> 1))`, mixing half per-texel grain with half `2x2` block grain.
- **OKLab nearest-index search and LUT:** `nearestIndex` searches indices `1..255` (reserving index `0` for clear texels and keeping all 255 colors, including rare tans `16..31` for cream canvas). OKLab distance uses `HUE_WEIGHT = 4` to weight `a` and `b` chroma against lightness so cream tones never fleck to pale mint. An `Int16Array(1 << 18)` LUT caches matches keyed on 6 bits per RGB channel and resets whenever `setDfLookPalette` runs.
- **Alpha preservation:** Alpha bytes copy untouched, and texels with alpha `0` retain their RGB bytes byte-for-byte.
