---
slug: held-map-ink-cartography-and-zoom-bands
title: "Held Map Ink Model, Zoom Bands, and Cached Layers"
domain: ui
kind: subcard
parent: held-map-overview
files:
  - src/ui/inkMap.js
  - src/ui/overworldModel.js
  - src/ui/heldMap.js
  - src/ui/mapScale.js
routes: []
tables: []
replacesBible:
  - "10-UI/Held-Map-Arc.md"
related:
  - held-map-overview
  - tamriel-held-map-ink
  - held-map-travel-options-and-filter-key
invariants:
  - "All Bay geography is computed at runtime from WOODS.WLD, MAPS.BSA and roads data through buildInkModel (src/ui/inkMap.js). No ARENA2 raster is drawn."
  - "ZOOM_BANDS: far from 0, mid from 2.4, near from 5.5 paper px per map px (zoomBand). SCALE_MAX = 14. clampView bounds pan and zoom to the paper."
  - "Static ink (paintInkStatic) is a kept layer redrawn only on view, band, discovery or filter change. Pulses and rings go on paintInkOverlay."
  - "Place marks are cached by syncMarksLayer and blitted by blitMarksLayer, so a pan does not re-ink the sheet (MAP-PAN)."
  - "Halo first: PEN.halo (parchment at 0.80) is stroked under every glyph and name before any ink. Relief carets use PEN.relief (ink at 0.26)."
traps:
  - "Plain Chaikin cuts long straight border runs into diagonals. roundCorners(line, maxCut = 1.5) bounds each cut."
  - "Every halo must go down before every glyph. A per-mark halo then ink order lets a neighbor's halo cover finished ink."
dfu: []
tags:
  - held-map
  - ink
  - cartography
  - zoom-bands
  - performance
---

# Held Map Ink Model, Zoom Bands, and Cached Layers

`src/ui/inkMap.js` derives all Iliac Bay cartography at runtime from `WOODS.WLD`, `MAPS.BSA`, and road topology, rendering multi-band vector ink across cached static and mark layers.

- **Runtime Cartography and Corner Rounding (`src/ui/inkMap.js`, `src/ui/overworldModel.js`):** `buildInkModel` consumes `buildMarkerModel` and `traceChains` from `src/ui/overworldModel.js` alongside `boundarySegments`, `linkSegments`, and `placeNames` (`NAME_RANK`, `BAND_MARKS`). Because plain Chaikin smoothing cuts long straight border runs into diagonals, `roundCorners(line, maxCut = 1.5)` caps each corner cut.
- **Zoom Bands and UI Scaling (`src/ui/inkMap.js`, `src/ui/mapScale.js`):** `zoomBand` selects among `ZOOM_BANDS` (`far` from `0`, `mid` from `2.4`, and `near` from `5.5` paper pixels per map pixel, up to `SCALE_MAX = 14`), while `clampView` bounds pan and zoom to the parchment rectangle. `mapUiScale(height, pref)` in `src/ui/mapScale.js` scales chrome from `MAP_SCALE_BASE_H = 1080` within `[0.75, 2]`.
- **Cached Static/Mark Layers and Halo-First Ordering (`src/ui/inkMap.js`, `src/ui/heldMap.js`):** `paintInkStatic` draws onto a retained canvas refreshed only when the view, zoom band, discovery set, or filter changes, while `syncMarksLayer` and `blitMarksLayer` cache and blit place marks so panning does not re-ink the sheet. Animated pulses, party labels (`PARTY_LABEL_STACK = 13`), and raid marks (`paintRaidMark`) draw on `paintInkOverlay`. Every `PEN.halo` stroke (parchment at `0.80`, including `HARBOUR_HALO = 3.4`) is laid down across all glyphs and names before any `GLYPH_PEN = 1.5`, `HARBOUR_PEN = 1.3`, `paintGlyph`, or `PEN.relief` (ink at `0.26`) pass so a neighbor's halo never covers finished ink.
